// `lens` (verse 2, lines 3–4) — docs/TREATMENT.md, the real device in the studio:
//   "A camera on the back that only reads light": a macro on the rear camera's metal ring. Light comes
//     in as true 3D hairlines: a cone of rays from all round the back, dashes travelling inward and
//     converging into the lens (only in). The line is etched on the frosted glass beside the ring, so
//     it slides past as the camera pulls back over the back; a light bar crosses on "light";
//     `light in · nothing out` sits under the ring.
//   "QR in, QR out, and nothing online": the device turns to its screen. The screen's headings are the
//     sung words: "QR in" over a viewfinder scanning a code, "QR out" over the signed code, whose
//     white hairlines leave the screen towards the camera. On "nothing online" a globe drawn in 3D
//     hairlines (meridians and parallels) turns behind the device, grey, never lighting, the words set
//     under it in the world. The camera ends pushing in on the screen, where `guard` picks up.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, TAU } from '../engine/util';
import { DEVICE, qrMatrix } from './_motifs';
import { add, camera3, glow3D, lyric3D, mix3, mul, norm, plane, studio, sub, text3D, type Plane } from './_space';
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
  lines = new LineBatch(20000, { screen2D: false, blend: 'add' });
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

  /** A plane lying on the back glass (outside), from device-space origin: u = right as seen from behind, v = up. */
  backPlane(pose: DevicePose, x: number, y: number): Plane {
    const o = this.dev.toWorld(pose, [x, y, -TH - 0.004]);
    const u = norm(sub(this.dev.toWorld(pose, [x - 1, y, -TH]), this.dev.toWorld(pose, [x, y, -TH])));
    const v = norm(sub(this.dev.toWorld(pose, [x, y + 1, -TH]), this.dev.toWorld(pose, [x, y, -TH])));
    return { o, u, v };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t, t0 = this.ctx.start, t1 = this.ctx.end;
    const c2 = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    const light = wd(l1, 'light');
    const bone = LIN.bone;
    const sc = (k: number): [number, number, number] => [bone[0] * k, bone[1] * k, bone[2] * k];

    // ---- camera
    let pose: DevicePose;
    const back: V3 = [Math.PI, 0.06, 0];
    if (t < c2) {
      // from a macro on the lens, pulling back over the frosted glass
      const k = prog(t, t0, c2, ease.inOutCubic);
      const p0: DevicePose = { cam: [0, 0, 1], tgt: [0, 0, 0], fov: 0.5, rot: back };
      const lw = this.dev.toWorld(p0, LENS);
      const tgt: V3 = [lerp(lw[0] + 0.06, 0.25, k), lerp(lw[1] - 0.02, 0.1, k), lerp(lw[2], 0, k)];
      pose = {
        cam: orbit(tgt, lerp(0.5, 3.9, k * k), lerp(0.3, -0.14, k), lerp(0.16, 0.05, k)), tgt, fov: 0.5, rot: back,
        sweep: lerp(1.5, -1.5, prog(t, wd(l1, 'reads').start, light.end + 0.3, ease.inOutCubic)),
        gain: lerp(0.6, 1, k),
      };
    } else {
      // it turns to its screen; the globe comes up behind on the right; then a push in on the screen
      const turn = prog(t, c2 - 0.05, c2 + 0.9, ease.inOutCubic);
      const k = prog(t, c2, t1);
      const push = prog(t, wd(l2, 'online').start - 0.2, t1, ease.inCubic);
      const tgt: V3 = [lerp(lerp(0.25, 0.7, turn), 0.08, push), lerp(0.02, -0.02, turn), 0];
      pose = {
        cam: orbit(tgt, lerp(3.9, 4.4, turn) - 0.25 * k - 1.9 * push, lerp(-0.12, 0.08, k) * (1 - push), 0.05 * (1 - push)), tgt, fov: 0.5,
        rot: [lerp(Math.PI, 0.2, turn) - 0.2 * push, lerp(0.06, 0, turn), 0], screen: turn,
        sweep: lerp(-1.5, 1.5, turn),
      };
      this.screen(t, l2);
    }
    const cam = camera3(pose);

    const b = this.bg.ctx;
    const gc = this.dev.project(pose, [0, 0, 0]);
    studio(b, clamp(gc.x, W * 0.2, W * 0.8), clamp(gc.y, H * 0.2, H * 0.8));
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });

    const LB = this.lines;
    // ---- behind the device (line 2): the globe, never lit
    LB.clear();
    let globeLabel: V3 | null = null;
    if (t >= c2) {
      const nothing = wd(l2, 'nothing');
      const kg = (0.45 * prog(t, c2 + 0.2, c2 + 1.2, ease.outCubic) + 0.55 * prog(t, nothing.start - 0.3, nothing.start + 0.3, ease.outCubic)) * (1 - prog(t, t1 - 0.6, t1));
      if (kg > 0) {
        const G: V3 = [2.05, 0.25, -1.6], R = 0.75, spin = t * 0.35;
        const A = 0.32 * kg;
        const P = (lat: number, lon: number): V3 => [G[0] + R * Math.cos(lat) * Math.sin(lon + spin), G[1] + R * Math.sin(lat), G[2] + R * Math.cos(lat) * Math.cos(lon + spin)];
        for (let m = 0; m < 12; m++) {
          const lon = (m / 12) * Math.PI * 2;
          for (let i = 0; i < 24; i++) {
            const a0 = -Math.PI / 2 + (i / 24) * Math.PI, a1 = a0 + Math.PI / 24;
            const p = P(a0, lon), q = P(a1, lon);
            const face = 0.35 + 0.65 * clamp((p[2] - G[2]) / R * 0.5 + 0.5); // the far side dimmer
            LB.seg(...p, ...q, 1, ...sc(A * face), 1);
          }
        }
        for (let j = 1; j < 8; j++) {
          const lat = -Math.PI / 2 + (j / 8) * Math.PI;
          for (let i = 0; i < 48; i++) {
            const p = P(lat, (i / 48) * Math.PI * 2), q = P(lat, ((i + 1) / 48) * Math.PI * 2);
            const face = 0.35 + 0.65 * clamp((p[2] - G[2]) / R * 0.5 + 0.5);
            LB.seg(...p, ...q, 1, ...sc(A * face), 1);
          }
        }
        globeLabel = [G[0] - R, G[1] - R - 0.22, G[2] + 0.1];
      }
    }
    if (LB.count) LB.render(renderer, out, cam);
    comp.draw(renderer, this.dev.render(renderer, pose, t >= c2), out);

    // ---- in front: rays into the lens (line 1); the signed code's hairlines leaving (line 2)
    LB.clear();
    const lensW = this.dev.toWorld(pose, LENS);
    if (t < c2) {
      const kr = prog(t, t0, t0 + 0.4) * (1 - prog(t, lerp(t0, c2, 0.75), c2 - 0.1));
      const nrm = norm(sub(this.dev.toWorld(pose, [LENS[0], LENS[1], -TH - 1]), lensW)); // out of the back
      const ref: V3 = Math.abs(nrm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const e1 = norm([nrm[1] * ref[2] - nrm[2] * ref[1], nrm[2] * ref[0] - nrm[0] * ref[2], nrm[0] * ref[1] - nrm[1] * ref[0]]);
      const e2: V3 = [nrm[1] * e1[2] - nrm[2] * e1[1], nrm[2] * e1[0] - nrm[0] * e1[2], nrm[0] * e1[1] - nrm[1] * e1[0]];
      const n = 220;
      for (let i = 0; i < n; i++) {
        // a direction in a wide cone about the back's normal
        const th = hash(i, 1) * TAU, ph = Math.acos(1 - hash(i, 2) * 0.72);
        const d = add(add(mul(nrm, Math.cos(ph)), mul(e1, Math.sin(ph) * Math.cos(th))), mul(e2, Math.sin(ph) * Math.sin(th)));
        const Rr = 1.2 + 3 * hash(i, 3);
        const src = add(lensW, mul(d, Rr));
        const end = add(lensW, mul(d, DEVICE.cam.r * 0.9));
        LB.seg(...src, ...end, 0.7, ...sc(0.05 * kr), 1);
        for (let j = 0; j < 2; j++) {
          const u = (t * (0.35 + 0.25 * hash(i, 4)) + hash(i, 5) + j * 0.5) % 1;
          const p0 = mix3(src, end, u), p1 = mix3(src, end, Math.min(1, u + 0.05 + 0.05 * u));
          const a = kr * Math.sin(Math.PI * u) * (0.6 + 0.8 * u);
          LB.seg(...p0, ...p1, 1.1, ...sc(a), 1);
        }
      }
      // the lens gathers it
      glow3D(LB, add(lensW, mul(nrm, 0.01)), 2.4, bone, 0.35 * kr);
    } else {
      const qrOut = l2.words.filter((w) => w.w.toLowerCase().startsWith('qr'))[1]!;
      const ko = prog(t, qrOut.start, qrOut.start + 1.0) * (1 - prog(t, qrOut.start + 0.7, qrOut.start + 1.0));
      if (ko > 0) {
        const nrm = norm(sub(this.dev.toWorld(pose, [0, 0, 1]), this.dev.toWorld(pose, [0, 0, 0])));
        for (let i = 0; i < 22; i++) {
          const q: V3 = [(hash(i, 8) - 0.5) * 0.62, -0.12 + (hash(i, 9) - 0.5) * 0.62, TH + 0.01];
          const a = this.dev.toWorld(pose, q);
          const u = ((ko * 1.4 + hash(i, 10)) % 1);
          const p0 = add(a, mul(nrm, u * 3)), p1 = add(a, mul(nrm, u * 3 + 0.35));
          LB.seg(...p0, ...p1, 1.2, ...sc(1.2 * Math.sin(Math.PI * u) * ko), 1);
        }
      }
    }
    if (LB.count) LB.render(renderer, out, cam);

    // ---- type in the world
    const c = this.text.ctx;
    this.text.clear();
    const fam = F.archivo(100, 800);
    if (t < c2) {
      // etched on the back beside the ring: two rows, and the note under the ring
      const pl = this.backPlane(pose, LENS[0] - 0.09, LENS[1] + 0.03);
      const a = 1 - prog(t, c2 - 0.3, c2);
      lyric3D(c, pose, l1, t, pl, { family: fam, size: 0.052, on: rgba('bone', 0.95), off: rgba('bone', 0.2), rows: [4], leading: 0.066, pop: 0.015, alpha: a });
      const only = wd(l1, 'only');
      const kl = prog(t, only.start - 0.05, only.start + 0.3, ease.outExpo) * a;
      if (kl > 0) {
        c.fillStyle = rgba('bone', 0.8 * kl);
        text3D(c, pose, 'light in · nothing out', F.mono(500), 0.04, this.backPlane(pose, LENS[0] + 0.05, LENS[1] - 0.1));
      }
    } else if (globeLabel) {
      const nothing = wd(l2, 'nothing');
      const a = prog(t, nothing.start - 0.3, nothing.start) * (1 - prog(t, t1 - 0.5, t1));
      const tail: Line = { ...l2, words: l2.words.slice(l2.words.indexOf(wd(l2, 'and'))) };
      lyric3D(c, pose, tail, t, plane(globeLabel, 0.05), { family: fam, size: 0.16, on: rgba('bone'), off: rgba('bone', 0.2), alpha: a });
      c.fillStyle = rgba('ash', 0.8 * a);
      text3D(c, pose, 'offline', F.mono(500), 0.055, plane(add(globeLabel, [0, -0.13, 0]), 0.05));
    }
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.45, vignette: 0.42 };
  }
}
