// `guard` (verse 2, lines 5–6) — docs/TREATMENT.md, the real device in the studio:
//   "Contract says "approve all"?": close on the screen, a contract call scrolls by as raw hex; the
//     camera pulls back and the hex goes on behind the device as a wall of calldata set in 3D (rows
//     of type on a plate in the world, hairline rules, scrolling fast, unreadable). The sung line is set
//     on the plate, in front of the hex.
//   "SignGuard says wait": on the beat the scroll stops dead, the device jolts, its screen turns to an
//     inverted bone panel: WAIT, `SignGuard`, `unlimited approval · unknown contract`.
//   "Clear signing in words, not hex on a plate": the screen decodes the call into plain words
//     (Approve / UNLIMITED / USDT / to 0x9f…e21c, the risk in green, inside the device); the sung line
//     is set in the world to the left; from "not" the hex plate (framed by hairlines like a metal
//     nameplate) swings away and slides out of frame.
// Everything shown is made up (no real contract or address).
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, springStep } from '../engine/util';
import { Device3D, SCREEN, orbit, outline, type DevicePose, type V3 } from './_device3d';
import { camera3, lyric3D, onPlane, path3D, plane, rrect3D, studio, text3D, toW, type Plane } from './_space';

const bone = (a = 1) => rgba('bone', a);
const HEXD = '0123456789abcdef';
/** One row of fake calldata: approve(spender, uint256.max) style. */
function hexRow(i: number): string {
  const m = ((i % 7) + 7) % 7;
  if (m === 0) return '0x095ea7b3' + '000000000000000000000000' + '9f3c1d0e7b2a44c1e21c';
  if (m === 1) return 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  let s = '';
  for (let k = 0; k < 64; k++) s += HEXD[Math.floor(hash(i, k, 9) * 16)];
  return s;
}
const PLAIN = ['Approve', 'UNLIMITED', 'USDT', 'to 0x9f…e21c'];
/** The hex plate: a wall behind the device (centre, size in world units). */
const PLATE = { c: [0.1, 0.05, -1.3] as V3, w: 3.6, h: 2.5, row: 0.12, size: 0.066 };

export default class Guard extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  text = new Layer2D();
  lines = new LineBatch(8000, { screen2D: false, blend: 'add' });
  outl = outline(96, 0.03);
  L: Line[] = [];

  override init() {
    this.L = ['Contract says', 'Clear signing in words'].map((q) => this.ctx.lyrics.get(q));
  }

  times() {
    const { audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(q))!;
    const sg = wd(l1, 'signguard');
    return {
      c2: audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02))),
      stopT: audio.timeOfBeat(Math.round(audio.beatAt(sg.start))), // the stop lands on the beat at "SignGuard"
      wd,
    };
  }

  /** Scroll offset (rows) of the hex: fast until the stop, then frozen. */
  scroll(t: number, stopT: number) {
    return (Math.min(t, stopT) - this.ctx.start) * 16;
  }

  screen(t: number) {
    const [l1, l2] = this.L as [Line, Line];
    const { c2, stopT, wd } = this.times();
    const c = this.dev.screen.ctx;
    const sw = SCREEN.w, sh = SCREEN.h, pad = 40;
    this.dev.screen.clear(rgba('ink'));
    if (t < stopT) {
      // raw calldata, scrolling
      c.font = font(F.mono(500), 26);
      c.fillStyle = bone(0.55);
      c.fillText('contract call · raw data', pad, 64);
      const sc = this.scroll(t, stopT);
      c.font = font(F.mono(400), 25);
      const lh = 38, first = Math.floor(sc);
      c.save();
      c.beginPath(); c.rect(0, 90, sw, sh - 90); c.clip();
      for (let r = -1; r < (sh - 90) / lh + 2; r++) {
        const i = first + r, y = 120 + (r - (sc - first)) * lh;
        const row = hexRow(i);
        const hot = ((i % 7) + 7) % 7 < 2;
        c.fillStyle = hot ? bone(0.9) : bone(0.4);
        c.fillText(row.slice(0, 16) + ' ' + row.slice(16, 32), pad, y);
      }
      c.restore();
      // "approve all": the approve() row gets bracketed while it is sung
      const ap = wd(l1, 'approve');
      const k = prog(t, ap.start - 0.05, ap.start + 0.2) * (1 - prog(t, stopT - 0.2, stopT));
      if (k > 0) {
        c.fillStyle = rgba('signal', 0.2 * k);
        c.fillRect(pad - 10, sh * 0.45, sw - 2 * pad + 20, 46);
        c.strokeStyle = rgba('signal', k);
        c.lineWidth = 3;
        c.strokeRect(pad - 10, sh * 0.45, sw - 2 * pad + 20, 46);
      }
      return;
    }
    if (t < c2) {
      // WAIT: an inverted bone panel
      const kw = prog(t, stopT - 0.02, stopT + 0.12, ease.outExpo);
      c.fillStyle = bone(0.55);
      c.font = font(F.mono(500), 30);
      c.fillText('SignGuard', pad, 80);
      const s = lerp(1.25, 1, kw);
      c.save();
      c.translate(sw / 2, sh * 0.44);
      c.scale(s, s);
      c.fillStyle = bone(clamp(kw * 3));
      c.beginPath(); c.roundRect(-sw / 2 + pad, -150, sw - 2 * pad, 300, 28); c.fill();
      c.font = font(F.archivo(112, 900), 132);
      c.fillStyle = rgba('ink');
      const tw = c.measureText('WAIT').width;
      c.fillText('WAIT', -tw / 2, 60);
      c.restore();
      c.font = font(F.mono(500), 27);
      c.fillStyle = bone(0.85 * kw);
      c.fillText('unlimited approval', pad, sh * 0.44 + 220);
      c.fillText('unknown contract', pad, sh * 0.44 + 262);
      c.fillStyle = rgba('signal', kw);
      c.beginPath(); c.arc(sw - pad - 12, 70, 10, 0, Math.PI * 2); c.fill();
      return;
    }
    // clear signing: the call in plain words
    const decode = prog(t, c2, wd(l2, 'words').end, ease.inOutCubic);
    c.fillStyle = bone(0.55);
    c.font = font(F.mono(500), 28);
    c.fillText('clear signing', pad, 80);
    const fam = F.archivo(100, 800);
    PLAIN.forEach((w, i) => {
      const k = clamp(decode * (PLAIN.length + 1) - i);
      let s = '';
      for (let j = 0; j < w.length; j++) s += j / w.length < k ? w[j] : HEXD[Math.floor(hash(i, j, Math.floor(t * 24)) * 16)];
      const big = i === 1;
      c.font = big ? font(F.archivo(100, 900), 74) : i === 3 ? font(F.mono(500), 44) : font(fam, 70);
      c.fillStyle = k >= 1 ? (big ? rgba('signal') : bone()) : bone(0.4);
      c.fillText(s, pad, 220 + [0, 110, 210, 300][i]!);
    });
    c.fillStyle = 'rgba(60,64,61,1)';
    c.fillRect(pad, sh - 250, sw - 2 * pad, 2);
    c.font = font(F.mono(400), 26);
    c.fillStyle = bone(0.6 * decode);
    c.fillText('what you sign is', pad, sh - 190);
    c.fillText('what you read', pad, sh - 150);
    // two buttons: reject (bone), approve (dim)
    const by = sh - 110;
    c.fillStyle = bone(0.9 * decode);
    c.beginPath(); c.roundRect(pad, by, (sw - 2 * pad) / 2 - 10, 76, 38); c.fill();
    c.fillStyle = 'rgba(38,42,39,1)';
    c.beginPath(); c.roundRect(sw / 2 + 10, by, (sw - 2 * pad) / 2 - 10, 76, 38); c.fill();
    c.font = font(F.archivo(100, 700), 32);
    c.fillStyle = rgba('ink', decode);
    c.fillText('Reject', pad + 70, by + 49);
    c.fillStyle = bone(0.5 * decode);
    c.fillText('Approve', sw / 2 + 60, by + 49);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t, t0 = this.ctx.start, t1 = this.ctx.end;
    const { c2, stopT, wd } = this.times();

    // ---- camera: from close on the screen (where `lens` left it) back to three-quarter; a jolt on the stop
    const pull = prog(t, t0, stopT, ease.inOutCubic);
    const k2 = prog(t, c2, t1, ease.inOutQuad);
    const jolt = t > stopT ? Math.sin(Math.min(1, (t - stopT) / 0.1) * Math.PI) * Math.pow(0.5, (t - stopT) / 0.15) : 0;
    const T: V3 = [lerp(0.08, 0.5, pull), lerp(-0.02, 0.02, pull), lerp(0, -0.3, pull)];
    const pose: DevicePose = {
      cam: orbit(T, lerp(2.25, 4.7, pull) - 0.35 * k2, lerp(-0.2, 0.28, pull) + 0.12 * k2, lerp(0, 0.07, pull)), tgt: T, fov: 0.55,
      pos: [lerp(0, 1.0, pull) + 0.1 * k2, 0, 0.12 * jolt], rot: [lerp(-0.2, -0.3, pull) - 0.15 * k2, 0, 0.03 * jolt], screen: 1,
      sweep: t > stopT && t < c2 ? lerp(-1.6, 1.6, prog(t, stopT, stopT + 0.7, ease.outCubic)) : lerp(-1.6, 1.6, prog(t, c2, wd(l2, 'words').end + 0.4, ease.inOutCubic)),
    };
    const cam = camera3(pose);
    this.screen(t);

    // ---- the plate: a wall of hex behind the device; it swings away from "not" to "plate"
    const away = prog(t, wd(l2, 'not').start - 0.1, wd(l2, 'plate').start + 0.25, ease.inOutCubic);
    const pc: V3 = [PLATE.c[0] - 5.5 * away, PLATE.c[1] + 0.2 * away, PLATE.c[2] - 1.5 * away];
    const pl: Plane = plane(pc, 0.18 + 0.9 * away);
    const plA = prog(t, t0 + 0.2, t0 + 1.0) * (1 - prog(t, wd(l2, 'plate').end - 0.2, wd(l2, 'plate').end + 0.2));

    const b = this.bg.ctx;
    const gc = this.dev.project(pose, [0, 0, 0]);
    studio(b, clamp(gc.x, W * 0.25, W * 0.75), gc.y);
    if (plA > 0) {
      // the hex rows, set on the plate
      const sc = this.scroll(t, stopT);
      const first = Math.floor(sc), rows = Math.floor(PLATE.h / PLATE.row);
      for (let r = 0; r < rows + 1; r++) {
        const i = first + r;
        const y = PLATE.h / 2 - 0.12 - (r - (sc - first)) * PLATE.row;
        if (y < -PLATE.h / 2 + 0.06 || y > PLATE.h / 2 - 0.08) continue;
        const hot = ((i % 7) + 7) % 7 < 2;
        const stopped = t >= stopT;
        const fade = Math.min(1, (PLATE.h / 2 - 0.08 - y) / 0.3, (y + PLATE.h / 2 - 0.06) / 0.3);
        b.fillStyle = bone(plA * fade * (hot && stopped ? 0.5 : 0.1 + 0.06 * hash(i, 3)));
        text3D(b, pose, hexRow(i), F.mono(400), PLATE.size, { o: onPlane(pl, -PLATE.w / 2 + 0.14, y), u: pl.u, v: pl.v });
      }
    }
    if (t < c2 + 0.3) {
      // line 1 on the plate, in front of the hex, left of the device (behind it in depth: drawn under it)
      const a = prog(t, t0 + 0.3, t0 + 0.8) * (1 - prog(t, c2 - 0.1, c2 + 0.3));
      // an ink halo keeps the words readable over the hex
      b.save(); b.shadowColor = 'rgba(10,11,10,0.95)'; b.shadowBlur = 28;
      lyric3D(b, pose, l1, t, { o: onPlane(pl, -PLATE.w / 2 + 0.2, 0.88, 0.2), u: pl.u, v: pl.v }, {
        family: F.archivo(100, 800), size: 0.23, on: rgba('bone'), off: rgba('bone', 0.3), rows: [2, 4, 5], leading: 0.29, alpha: a,
      });
      b.restore();
    }
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });

    const LB = this.lines;
    LB.clear();
    const bl = LIN.bone;
    if (plA > 0) {
      // the plate's hairline frame, rivets, and row rules
      const fr = rrect3D(pl, 0, 0, PLATE.w, PLATE.h, 0.08, 6);
      const k = prog(t, t0, t0 + 1.2, ease.outCubic);
      path3D(LB, fr, 0, k, 1.3, [bl[0] * 0.7 * plA, bl[1] * 0.7 * plA, bl[2] * 0.7 * plA], 1, true);
      const fr2 = rrect3D(pl, 0, 0, PLATE.w - 0.08, PLATE.h - 0.08, 0.05, 6);
      path3D(LB, fr2, 0, k, 1, [bl[0] * 0.3 * plA, bl[1] * 0.3 * plA, bl[2] * 0.3 * plA], 1, true);
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const cx = x * (PLATE.w / 2 - 0.1), cy = y * (PLATE.h / 2 - 0.1);
        const ring: V3[] = Array.from({ length: 12 }, (_, j) => onPlane(pl, cx + 0.025 * Math.cos(j * 0.5236), cy + 0.025 * Math.sin(j * 0.5236)));
        path3D(LB, ring, 0, 1, 1, [bl[0] * 0.6 * plA, bl[1] * 0.6 * plA, bl[2] * 0.6 * plA], 1, true);
      }
      // the hot row when stopped: a bracket in the world, on the approve() calldata
      if (t >= stopT) {
        const kb = prog(t, stopT, stopT + 0.25, ease.outExpo) * plA * (1 - prog(t, c2, c2 + 0.4));
        const sc = this.scroll(t, stopT);
        for (let r = 0; r < 30; r++) {
          const i = Math.floor(sc) + r;
          if (((i % 7) + 7) % 7 !== 0) continue;
          const y = PLATE.h / 2 - 0.12 - (r - (sc - Math.floor(sc))) * PLATE.row;
          if (y < -PLATE.h / 2 + 0.2 || y > PLATE.h / 2 - 0.2) continue;
          const a = onPlane(pl, -PLATE.w / 2 + 0.08, y - 0.03, 0.01), bb = onPlane(pl, -PLATE.w / 2 + 0.08 + 3.3 * kb, y - 0.03, 0.01);
          LB.seg(...a, ...bb, 1.4, bl[0] * kb, bl[1] * kb, bl[2] * kb, 1);
        }
      }
    }
    if (LB.count) LB.render(renderer, out, cam);
    comp.draw(renderer, this.dev.render(renderer, pose), out);
    // the boundary flashes on the stop
    LB.clear();
    const kf = t > stopT ? Math.pow(0.5, (t - stopT) / 0.12) : 0;
    if (kf > 0.02) path3D(LB, toW(this.dev, pose, this.outl), 0, 1, 2, [bl[0] * 1.3 * kf, bl[1] * 1.3 * kf, bl[2] * 1.3 * kf], 1, true);
    if (LB.count) LB.render(renderer, out, cam);

    // ---- the sung lines, in the world
    const c = this.text.ctx;
    this.text.clear();
    const fam = F.archivo(100, 800);
    if (t >= c2) {
      // left of the device, facing the camera
      const a = prog(t, c2, c2 + 0.4);
      c.save(); c.shadowColor = 'rgba(10,11,10,0.95)'; c.shadowBlur = 28;
      lyric3D(c, pose, l2, t, plane([-0.05, 0.28, 0.2], 0.3), {
        family: fam, size: 0.19, on: rgba('bone'), off: rgba('bone', 0.3), rows: [3, 5], leading: 0.25, align: 'right', alpha: a,
      });
      c.restore();
    }
    comp.draw(renderer, this.text.upload(), out);
    void springStep;
    return {
      bloom: 0.42, vignette: 0.42,
      shake: [Math.sin(t * 90) * 6 * jolt, Math.cos(t * 70) * 4 * jolt] as [number, number],
      flash: t >= stopT ? 0.03 * Math.pow(0.5, (t - stopT) / 0.04) : 0,
    };
  }
}
