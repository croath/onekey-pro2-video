// `touch` (verse 2, lines 7–8) — docs/TREATMENT.md, the real device in the studio:
//   "Touch to unlock it": the device lies back, screen up; a fingerprint rises out of the glass as a
//     3D contour map (hairline ridges stacked in height, drawn ring by ring from the centre, the core
//     green: it is inside the device). On "unlock" the terrain presses flat onto the glass and the
//     screen wakes: `unlocked`.
//   "a PIN if you must": six PIN dots on the screen fill, one per word.
//   "Too many wrong guesses": the camera comes round to the screen; a counter 1/10 … 10/10 climbs one
//     per half beat, the device jolts on each and its boundary flashes.
//   "it wipes itself to dust": on "wipes" everything on the screen lifts off as fine grains (3D
//     streaks drifting up and out, fading), the screen goes dark, only the traced outline is left:
//     the empty device `passkey` relights.
// The sung lines stand to the left of the device, in its space.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, TAU } from '../engine/util';
import { DEVICE } from './_motifs';
import { Device3D, SCREEN, SCREEN_DU, orbit, outline, type DevicePose, type V3 } from './_device3d';
import { camera3, glow3D, lyric3D, mix3, path3D, plane, studio, toW } from './_space';

const bone = (a = 1) => rgba('bone', a);
const TH = DEVICE.t / 2;
/** Screen px -> device space (on the glass). */
const S2D = (px: number, py: number, z = TH + 0.003): V3 => [(px / SCREEN.w - 0.5) * SCREEN_DU.w, (0.5 - py / SCREEN.h) * SCREEN_DU.h, z];
const FP = { px: SCREEN.w / 2, py: 360 }; // fingerprint centre on the screen
const FPC = S2D(FP.px, FP.py);
const RINGS = 14;
/** Fingerprint ridge k (device space, flat), as a polyline with a gap at the bottom. */
function ridge(k: number): [number, number][] {
  const r = 0.028 + k * 0.021;
  const gap = 0.5 + 0.3 * hash(k, 2), th0 = -Math.PI / 2 + (hash(k, 3) - 0.5) * 0.8;
  const pts: [number, number][] = [];
  const n = 40 + k * 6;
  for (let i = 0; i <= n; i++) {
    const th = th0 + gap / 2 + (i / n) * (TAU - gap);
    const rr = r * (1 + 0.07 * Math.sin(2 * th + k * 0.4)) * (1 + 0.18 * Math.max(0, Math.sin(th)));
    pts.push([FPC[0] + Math.cos(th) * rr * 0.82, FPC[1] + Math.sin(th) * rr]);
  }
  return pts;
}
const RIDGES = Array.from({ length: RINGS }, (_, k) => ridge(k));

export default class Touch extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  text = new Layer2D();
  lines = new LineBatch(30000, { screen2D: false, blend: 'add' });
  outl = outline(128, 0.03);
  L: Line[] = [];

  override init() {
    this.L = ['Touch to unlock', 'Too many wrong guesses'].map((q) => this.ctx.lyrics.get(q));
  }

  times() {
    const { audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(q))!;
    const c2 = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const bW = audio.beatAt(l2.words[0]!.start);
    return { c2, bW, wd, unlock: wd(l1, 'unlock'), wipes: wd(l2, 'wipes') };
  }

  /** Wrong guesses so far (0..10), one per half beat from line 2's first word, and when the last one landed. */
  guesses(t: number, beat: number) {
    const { bW } = this.times();
    const [, l2] = this.L as [Line, Line];
    if (t < l2.words[0]!.start) return { n: 0, at: -1 };
    const n = Math.min(10, 1 + Math.floor((beat - bW) * 2 + 1e-4));
    return { n, at: this.ctx.audio.timeOfBeat(bW + (n - 1) / 2) };
  }

  screen(t: number, beat: number, alive: number) {
    const [l1] = this.L as [Line, Line];
    const { unlock, c2 } = this.times();
    const c = this.dev.screen.ctx;
    const sw = SCREEN.w, pad = 44;
    this.dev.screen.clear(rgba('ink'));
    if (alive <= 0) return;
    c.globalAlpha = alive;
    const un = t >= unlock.start;
    c.font = font(F.mono(500), 28);
    c.fillStyle = un ? rgba('signal') : bone(0.55);
    c.fillText(un ? 'unlocked' : 'locked', pad, 70);
    const { n, at } = this.guesses(t, beat);
    if (n > 0) {
      // the counter, where the fingerprint was
      const j = Math.pow(0.5, (t - at) / 0.08);
      c.font = font(F.archivo(100, 900), 150);
      const s = `${n}/10`;
      c.fillStyle = bone(0.85 + 0.15 * j);
      c.fillText(s, (sw - c.measureText(s).width) / 2, FP.py + 55);
      c.font = font(F.mono(500), 30);
      c.fillStyle = bone(0.6);
      const lab = n >= 10 ? 'wiping device' : 'wrong PIN';
      c.fillText(lab, (sw - c.measureText(lab).width) / 2, FP.py + 120);
    } else if (t >= c2 - 0.6 || un) {
      // the flattened print, printed on the glass
      const kk = 1 - prog(t, c2 - 0.3, c2);
      c.globalAlpha = alive * kk * prog(t, unlock.start, unlock.start + 0.3);
      c.lineWidth = 3;
      RIDGES.forEach((pts, k) => {
        c.strokeStyle = k < 2 ? rgba('signal') : bone(0.55);
        c.beginPath();
        pts.forEach(([x, y], i) => {
          const px = (x / SCREEN_DU.w + 0.5) * SCREEN.w, py = (0.5 - y / SCREEN_DU.h) * SCREEN.h;
          if (i) c.lineTo(px, py); else c.moveTo(px, py);
        });
        c.stroke();
      });
      c.globalAlpha = alive;
    }
    // PIN: six dots, filled across "a PIN if you must"
    const pinWords = l1.words.slice(l1.words.findIndex((w) => w.w === 'a'));
    const py = SCREEN.h * 0.74;
    const flash = n > 0 ? Math.pow(0.5, (t - at) / 0.06) : 0;
    for (let i = 0; i < 6; i++) {
      const w = pinWords[Math.min(pinWords.length - 1, Math.floor((i * pinWords.length) / 6))]!;
      const on = t >= w.start + (i % 2) * 0.12;
      const x = sw / 2 + (i - 2.5) * 62;
      c.strokeStyle = bone(0.8);
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, py, 15, 0, TAU); c.stroke();
      if (on && flash < 0.5) { c.fillStyle = bone(); c.fill(); }
    }
    if (flash > 0) {
      c.strokeStyle = bone(0.9 * flash);
      c.lineWidth = 4;
      c.beginPath(); c.roundRect(sw / 2 - 200, py - 40, 400, 80, 40); c.stroke();
    }
    c.globalAlpha = 1;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t, t0 = this.ctx.start, t1 = this.ctx.end;
    const { c2, unlock, wipes } = this.times();
    const { n: guesses, at: gAt } = this.guesses(t, f.beat);
    const alive = 1 - prog(t, wipes.start - 0.02, wipes.start + 0.15);
    const wipe = prog(t, wipes.start - 0.02, wipes.start + 1.6, ease.outCubic);

    // ---- camera: lying back, screen up (line 1); round to face the screen (line 2)
    const up = prog(t, c2 - 0.4, c2 + 0.6, ease.inOutCubic);
    const k1 = prog(t, t0, c2, ease.inOutQuad), k2 = prog(t, c2, t1, ease.inOutQuad);
    const jolt = guesses > 0 && alive > 0 ? Math.pow(0.5, (t - gAt) / 0.06) : 0;
    const T: V3 = [lerp(-0.02, -0.22, up), lerp(0.3, 0.02, up), 0];
    const pose: DevicePose = {
      cam: orbit(T, lerp(lerp(3.3, 3.7, k1), 4.1 - 0.2 * k2, up), lerp(lerp(-0.3, -0.18, k1), -0.18, up), lerp(0.28, 0.1, up)), tgt: T, fov: 0.55,
      pos: [0.48, 0, 0.03 * jolt], rot: [-0.3 + 0.04 * jolt * Math.sin(guesses * 3.1), lerp(-0.9, 0, up), 0.02 * jolt], screen: 1,
      sweep: lerp(-1.6, 1.6, prog(t, unlock.start - 0.2, unlock.start + 0.8, ease.inOutCubic)),
    };
    const cam = camera3(pose);
    this.screen(t, f.beat, alive);

    const b = this.bg.ctx;
    const gc = this.dev.project(pose, [0, 0, 0]);
    studio(b, gc.x, gc.y);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    comp.draw(renderer, this.dev.render(renderer, pose), out);

    // ---- lines on top of the glass
    const LB = this.lines;
    LB.clear();
    const bl = LIN.bone, sg = LIN.signal;
    // the fingerprint terrain: ring by ring from the centre, standing up; pressed flat on "unlock"
    const draw = prog(t, t0 + 0.1, unlock.start, ease.outCubic);
    const press = prog(t, unlock.start - 0.05, unlock.start + 0.3, ease.inOutCubic);
    const terrA = 1 - prog(t, unlock.start + 0.2, unlock.start + 0.45);
    if (draw > 0 && terrA > 0) {
      RIDGES.forEach((pts, k) => {
        const kr = clamp(draw * (RINGS + 2) - k);
        if (kr <= 0) return;
        const hgt = 0.34 * Math.pow(1 - k / RINGS, 1.6) * (1 - press) * ease.outCubic(kr);
        const P = pts.map(([x, y]) => this.dev.toWorld(pose, [x, y, TH + 0.004 + hgt]));
        const col = k < 2 ? [sg[0] * 2, sg[1] * 2, sg[2] * 2] as [number, number, number] : [bl[0] * 0.9, bl[1] * 0.9, bl[2] * 0.9] as [number, number, number];
        path3D(LB, P, 0, kr, k < 2 ? 1.8 : 1.2, col, terrA, false);
        // a few drop lines from the ridge down to the glass, like survey pins
        if (k % 3 === 1 && hgt > 0.02) for (let j = 0; j < P.length; j += 12) {
          const q = pts[j]!;
          const g = this.dev.toWorld(pose, [q[0], q[1], TH + 0.004]);
          LB.seg(...P[j]!, ...g, 0.8, bl[0] * 0.25, bl[1] * 0.25, bl[2] * 0.25, terrA * kr);
        }
      });
      const core = this.dev.toWorld(pose, [FPC[0], FPC[1], TH + 0.004 + 0.34 * (1 - press)]);
      if (draw > 0.1) glow3D(LB, core, 3, sg, terrA);
    }
    // the boundary: flashes with each wrong guess; after the wipe it is all that is left, traced
    const ow = toW(this.dev, pose, this.outl);
    if (jolt > 0.03) path3D(LB, ow, 0, 1, 2, [bl[0] * 1.2 * jolt, bl[1] * 1.2 * jolt, bl[2] * 1.2 * jolt], 1, true);
    const kt = prog(t, wipes.start + 0.3, wipes.start + 1.3, ease.inOutCubic);
    if (kt > 0) path3D(LB, ow, 0.125, 0.125 + kt, 1.5, [bl[0], bl[1], bl[2]], 1, true);
    // dust: grains lift off the glass and drift up and out, fading
    if (wipe > 0 && wipe < 1) {
      const nG = 1400;
      for (let i = 0; i < nG; i++) {
        // born on what was on the screen: the counter's block, the PIN row, the status line
        const hsel = hash(i, 9);
        const src: V3 = hsel < 0.55 ? S2D(SCREEN.w * (0.18 + 0.64 * hash(i, 1)), FP.py - 70 + 150 * hash(i, 2))
          : hsel < 0.85 ? S2D(SCREEN.w * (0.2 + 0.6 * hash(i, 1)), SCREEN.h * 0.74 + 30 * (hash(i, 2) - 0.5))
            : S2D(44 + 200 * hash(i, 1), 60 + 20 * hash(i, 2));
        const v: V3 = [(hash(i, 3) - 0.5) * 0.9, (hash(i, 4) - 0.35) * 0.9, 0.2 + 0.9 * hash(i, 5)];
        const w0 = Math.max(0, wipe - 0.03);
        const p = this.dev.toWorld(pose, [src[0] + v[0] * wipe, src[1] + v[1] * wipe + 0.3 * wipe * wipe, src[2] + v[2] * wipe]);
        const q = this.dev.toWorld(pose, [src[0] + v[0] * w0, src[1] + v[1] * w0 + 0.3 * w0 * w0, src[2] + v[2] * w0]);
        const a = Math.pow(1 - wipe, 1.3) * (0.4 + 0.6 * hash(i, 7));
        LB.seg(...q, ...p, 1.3, bl[0] * a, bl[1] * a, bl[2] * a, 1);
      }
    }
    if (LB.count) LB.render(renderer, out, cam);

    // ---- the sung lines, standing left of the device
    const c = this.text.ctx;
    this.text.clear();
    const fam = F.archivo(100, 800);
    const line = t < c2 ? l1 : l2;
    const a = t < c2 ? prog(t, t0, t0 + 0.4) * (1 - prog(t, c2 - 0.25, c2)) : prog(t, c2, c2 + 0.3);
    lyric3D(c, pose, line, t, plane([-0.1, 0.25, 0.1], -0.25), {
      family: fam, size: 0.16, on: bone(), off: bone(0.2), rows: t < c2 ? [4] : [4], leading: 0.21, align: 'right', alpha: a,
    });
    comp.draw(renderer, this.text.upload(), out);
    void mix3; void W; void H;
    return { bloom: 0.42, vignette: 0.42, shake: [Math.sin(guesses * 12.9) * 8 * jolt, Math.cos(guesses * 7.3) * 5 * jolt] as [number, number] };
  }
}
