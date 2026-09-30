// `touch` (verse 2, lines 7–8) — docs/TREATMENT.md, the real device in the studio:
//   "Touch to unlock it": close on the right edge, where the fingerprint sensor sits in the side key; a
//     fingerprint rises out of the key as a 3D contour map (hairline ridges stacked outwards, drawn
//     ring by ring from the centre, the core green: it is inside the device). On "unlock" the terrain
//     presses back into the key, the key's edge lights, and the screen wakes: `unlocked`; the camera
//     draws back to the screen.
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
import { camera3, glow3D, lyric3D, mix3, path3D, plane, studio, text3D, toW } from './_space';

const bone = (a = 1) => rgba('bone', a);
const TH = DEVICE.t / 2;
/** Screen px -> device space (on the glass). */
const S2D = (px: number, py: number, z = TH + 0.003): V3 => [(px / SCREEN.w - 0.5) * SCREEN_DU.w, (0.5 - py / SCREEN.h) * SCREEN_DU.h, z];
const FP = { px: SCREEN.w / 2, py: 360 }; // where the counter sits on the screen
/** The side key (fingerprint sensor) on the right edge: centre (device), half length along y, half height along z. */
const KEY = { c: [DEVICE.w / 2, 0.33, 0] as V3, hy: 0.075, hz: 0.022 };
const RINGS = 14;
/** Fingerprint ridge k on the side key, as (along y, along z) offsets from its centre, with a gap. */
function ridge(k: number): [number, number][] {
  const r = 0.007 + k * 0.0056;
  const gap = 0.5 + 0.3 * hash(k, 2), th0 = Math.PI + (hash(k, 3) - 0.5) * 0.8;
  const pts: [number, number][] = [];
  const n = 40 + k * 6;
  for (let i = 0; i <= n; i++) {
    const th = th0 + gap / 2 + (i / n) * (TAU - gap);
    const rr = r * (1 + 0.07 * Math.sin(2 * th + k * 0.4)) * (1 + 0.18 * Math.max(0, Math.cos(th)));
    pts.push([Math.cos(th) * rr, Math.sin(th) * rr * 0.27]);
  }
  return pts;
}
const RIDGES = Array.from({ length: RINGS }, (_, k) => ridge(k));
/** Device point on (or `h` out from) the side key, at ridge offset (u along y, v along z). */
const onKey = (u: number, v: number, h = 0): V3 => [KEY.c[0] + 0.002 + h, KEY.c[1] + u, KEY.c[2] + v];

export default class Touch extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  text = new Layer2D();
  lines = new LineBatch(30000, { screen2D: false, blend: 'add' });
  outl = outline(128, 0.03);
  keyLabel: { at: V3; a: number } | null = null;
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

    // ---- camera: close on the side key (the sensor) until "unlock", then back to the screen, which
    // lies back (line 1); round to face the screen (line 2)
    const up = prog(t, c2 - 0.4, c2 + 0.6, ease.inOutCubic);
    const k1 = prog(t, t0, c2, ease.inOutQuad), k2 = prog(t, c2, t1, ease.inOutQuad);
    const side = 1 - prog(t, unlock.start + 0.25, unlock.start + 1.6, ease.inOutCubic);
    const jolt = guesses > 0 && alive > 0 ? Math.pow(0.5, (t - gAt) / 0.06) : 0;
    const rot: V3 = [lerp(-0.3, -0.12, side) + 0.04 * jolt * Math.sin(guesses * 3.1), lerp(lerp(-0.9, 0, up), -0.95, side), 0.02 * jolt];
    const pos: V3 = [0.48, 0, 0.03 * jolt];
    const keyW = this.dev.toWorld({ cam: [0, 0, 1], tgt: [0, 0, 0], fov: 1, pos, rot }, KEY.c);
    const Tm: V3 = [lerp(-0.02, -0.22, up), lerp(0.3, 0.02, up), 0];
    const Ts: V3 = [keyW[0] + 0.12, keyW[1] - 0.03, keyW[2]];
    const T = mix3(Tm, Ts, ease.inOutCubic(side));
    const dist = Math.exp(lerp(Math.log(lerp(lerp(3.3, 3.7, k1), 4.1 - 0.2 * k2, up)), Math.log(1.2), side));
    const pose: DevicePose = {
      cam: orbit(T, dist, lerp(lerp(lerp(-0.3, -0.18, k1), -0.18, up), 0.85, side), lerp(lerp(0.28, 0.1, up), 0.18, side)), tgt: T, fov: 0.55,
      pos, rot, screen: 1,
      sweep: lerp(-1.6, 1.6, prog(t, t0 + 0.3, unlock.start + 0.8, ease.inOutCubic)),
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
    // the fingerprint terrain: ring by ring from the centre of the side key, standing out of it;
    // pressed back into the key on "unlock"
    const draw = prog(t, t0 + 0.1, unlock.start, ease.outCubic);
    const press = prog(t, unlock.start - 0.05, unlock.start + 0.3, ease.inOutCubic);
    const terrA = 1 - prog(t, unlock.start + 0.2, unlock.start + 0.45);
    if (draw > 0 && terrA > 0) {
      RIDGES.forEach((pts, k) => {
        const kr = clamp(draw * (RINGS + 2) - k);
        if (kr <= 0) return;
        const hgt = 0.1 * Math.pow(1 - k / RINGS, 1.6) * (1 - press) * ease.outCubic(kr);
        const P = pts.map(([u, v]) => this.dev.toWorld(pose, onKey(u, v, hgt)));
        const col = k < 2 ? [sg[0] * 2, sg[1] * 2, sg[2] * 2] as [number, number, number] : [bl[0] * 0.9, bl[1] * 0.9, bl[2] * 0.9] as [number, number, number];
        path3D(LB, P, 0, kr, k < 2 ? 1.6 : 1.1, col, terrA, false);
        // a few drop lines from the ridge back to the key, like survey pins
        if (k % 3 === 1 && hgt > 0.008) for (let j = 0; j < P.length; j += 12) {
          const q = pts[j]!;
          LB.seg(...P[j]!, ...this.dev.toWorld(pose, onKey(q[0], q[1])), 0.8, bl[0] * 0.25, bl[1] * 0.25, bl[2] * 0.25, terrA * kr);
        }
      });
      const core = this.dev.toWorld(pose, onKey(0, 0, 0.1 * (1 - press)));
      if (draw > 0.1) glow3D(LB, core, 3, sg, terrA);
    }
    // the key's edge: traced as the print forms, lit green as it reads the finger
    const kEdge = prog(t, t0 + 0.2, t0 + 1.0, ease.inOutCubic) * (1 - prog(t, unlock.start + 0.9, unlock.start + 1.6));
    if (kEdge > 0) {
      const lit = prog(t, unlock.start - 0.05, unlock.start + 0.15) * (1 - prog(t, unlock.start + 0.6, unlock.start + 1.4));
      const ring: V3[] = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * TAU, cs = Math.cos(a), sn = Math.sin(a);
        // the key's rounded outline (a superellipse)
        const u = Math.sign(cs) * Math.pow(Math.abs(cs), 0.25) * KEY.hy, v = Math.sign(sn) * Math.pow(Math.abs(sn), 0.5) * KEY.hz;
        ring.push(this.dev.toWorld(pose, onKey(u, v)));
      }
      const col: [number, number, number] = [lerp(bl[0] * 0.7, sg[0] * 2.2, lit), lerp(bl[1] * 0.7, sg[1] * 2.2, lit), lerp(bl[2] * 0.7, sg[2] * 2.2, lit)];
      path3D(LB, ring, 0, kEdge, 1.2 + lit, col, 1, true);
      // a leader off the key to its name
      const kl = prog(t, t0 + 0.6, t0 + 1.3, ease.outCubic) * kEdge;
      if (kl > 0) {
        const a = this.dev.toWorld(pose, onKey(-KEY.hy - 0.01, 0));
        const e = this.dev.toWorld(pose, [KEY.c[0] + 0.1, KEY.c[1] - 0.22, 0]);
        path3D(LB, [a, e], 0, Math.min(kl, 0.9999), 1, bl, 0.7);
        this.keyLabel = kl > 0.95 ? { at: e, a: prog(kl, 0.95, 1) } : null;
      } else this.keyLabel = null;
    } else this.keyLabel = null;
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
    if (this.keyLabel) {
      c.fillStyle = bone(0.9 * this.keyLabel.a);
      text3D(c, pose, 'fingerprint sensor', F.mono(500), 0.022, plane([this.keyLabel.at[0] + 0.012, this.keyLabel.at[1] - 0.008, this.keyLabel.at[2]], 0.3));
      c.fillStyle = bone(0.5 * this.keyLabel.a);
      text3D(c, pose, 'in the side key', F.mono(400), 0.016, plane([this.keyLabel.at[0] + 0.012, this.keyLabel.at[1] - 0.036, this.keyLabel.at[2]], 0.3));
    }
    const line = t < c2 ? l1 : l2;
    const a = t < c2 ? prog(t, t0, t0 + 0.4) * (1 - prog(t, c2 - 0.25, c2)) : prog(t, c2, c2 + 0.3);
    // close on the key the line stands to its right, facing the lens; it drifts back to the left of
    // the device as the camera draws back
    const cy = pose.cam[0] - pose.tgt[0], cz = pose.cam[2] - pose.tgt[2], yawC = Math.atan2(cy, cz);
    const rx = Math.cos(yawC), rz = -Math.sin(yawC);
    const sk = ease.inOutCubic(side);
    const Ps: V3 = [keyW[0] + rx * 0.2, keyW[1] + 0.1, keyW[2] + rz * 0.2];
    const pl = plane(mix3([-0.1, 0.25, 0.1], Ps, sk), lerp(-0.25, yawC, sk));
    lyric3D(c, pose, line, t, pl, {
      family: fam, size: lerp(0.16, 0.05, sk), align: sk > 0.5 ? 'left' : 'right', on: bone(), off: bone(0.2), rows: [4], leading: lerp(0.21, 0.066, sk), alpha: a * (sk > 0.4 && sk < 0.6 ? 0 : 1),
    });
    comp.draw(renderer, this.text.upload(), out);
    void mix3; void W; void H;
    return { bloom: 0.42, vignette: 0.42, shake: [Math.sin(guesses * 12.9) * 8 * jolt, Math.cos(guesses * 7.3) * 5 * jolt] as [number, number] };
  }
}
