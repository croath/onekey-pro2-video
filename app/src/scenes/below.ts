// `below` (verse 1, lines 5–6) — docs/TREATMENT.md, the real device on ink:
//   "Quiet by design, no edges to show": below-quiet.ts (the front, screen off; the BOUNDARY hairline).
//   "Everything that matters stays down below": from part 1's framing the device lies down, display
//     up, and comes apart layer by layer (cover glass, display with its flex, main board, battery,
//     frame, back glass), each part easing out with a slight overshoot; dashed assembly rails join
//     the layers' corners and thin 3D leaders label them on the right. The sung line lies on the
//     layers themselves, left of the stack: "Everything" on the cover glass, "that matters" on the
//     display, "stays down below" on the main board. On "down" the top layers lift away, the lower
//     ones drop out, and the camera dollies down onto the board (a macro with shallow depth of field):
//     the four secure elements light one per beat, the green key mark glows through the lid of the
//     second, and a leader rises from it: `private key · never leaves`. It ends with the key at frame
//     centre for the hand-off to `airgap`.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { DEVICE, keyMarkPath } from './_motifs';
import { quiet } from './below-quiet';
import { Device3D, EXPLODE_Z, PART_Z, SE_POS, orbit, seLid, type DevicePose, type V3 } from './_device3d';
import { LidAtlas } from './_board';
import { Macro } from './_macro';
import { camera3, glow3D, lyric3D, path3D, projW, studio, sub, type Plane } from './_space';

const PARTS = ['cover glass', 'display', 'main board', 'battery', 'frame', 'back glass'];
/** Labels, top of the stack down (by explode offset). */
const ORDER = [0, 1, 2, 4, 3, 5];
const KEY_SE = 1; // the secure element that holds the key
const EXPL = 1.7;
/** When each part starts to separate (bars after the cut), top of the stack first. */
const DELAY = [0, 0.1, 0.2, 0.3, 0.25, 0.35];
/** Part 1's last pose (below-quiet): orbit target, distance, yaw, pitch; device pos and rotation. */
const Q = { tgt: [0.2, 0.03, 0] as V3, dist: 3.95, yaw: 0.08, pitch: 0.06, pos: [0.62, 0, 0] as V3, rot: [-0.12, 0, 0] as V3 };
const S = { tgt: [-0.5, 0.52, 0.1] as V3, dist: 6.3, yaw: 0.3, pitch: 0.66, rot: [0.3, -Math.PI / 2, 0] as V3 };

const backOut = (x: number) => { const s = 1.4; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
const mix3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export default class Below extends Scene {
  dev = new Device3D();
  macro = new Macro();
  bg = new Layer2D();
  text = new Layer2D();
  lines = new LineBatch(20000, { screen2D: false, blend: 'add' });
  L: Line[] = [];

  override init() {
    this.L = ['Quiet by design', 'Everything that matters'].map((q) => this.ctx.lyrics.get(q));
  }

  /** z (device) of part i's top face. */
  partZ(i: number, p: DevicePose): number {
    return PART_Z[i]! + EXPLODE_Z[i]! * (p.explode ?? 0) + (p.offs?.[i] ?? 0) + (i < 2 ? p.lift ?? 0 : 0);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t;
    const cB = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    this.text.clear();
    if (t < cB) {
      // ---------------------------------------------------------------- the front, screen off: below-quiet.ts
      return quiet({ dev: this.dev, bg: this.bg, text: this.text, renderer, comp, start: this.ctx.start }, f, out, l1, cB);
    }
    return this.stack(f, out, l2, cB);
  }

  // ---------------------------------------------------------------- exploded, then down to the board
  stack(f: Frame, out: THREE.WebGLRenderTarget, l2: Line, cB: number) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t;
    const bar = f.bar - audio.barAt(cB);
    const words = l2.words;
    const down = words[4]!;
    // lie down and pull back (from part 1's framing), then dive onto the board from "down"
    const lie = prog(bar, 0, 1.25, ease.inOutCubic);
    const turn = prog(bar, 0, 0.95, ease.inOutCubic);
    const dive = prog(t, down.start - 0.15, down.start + 2.6, ease.inOutCubic);
    const kG = prog(bar, 0.3, 1.9, ease.inOutCubic);
    const k = (i: number) => backOut(prog(bar, 0.3 + DELAY[i]!, 1.45 + DELAY[i]!));
    const explode = EXPL * kG;
    // top layers lift away, the lower ones drop out, as the camera goes down
    const up = prog(t, down.start - 0.1, down.start + 1.6, ease.inCubic);
    const drop = prog(t, down.start, down.start + 1.4, ease.inCubic);
    const offs = [0, 1, 2, 3, 4, 5].map((i) => EXPLODE_Z[i]! * EXPL * (k(i) - kG) - (i >= 3 ? drop * 1.6 : 0)) as [number, number, number, number, number, number];
    const rot = mix3(Q.rot, S.rot, turn);
    const pos = mix3(Q.pos, [0, 0, 0], lie);
    const pose0: DevicePose = { cam: [0, 0, 5], tgt: [0, 0, 0], fov: 0.6, rot, pos, explode, offs };
    // the key's secure element (world), where the camera ends up
    const keyW = this.dev.toWorld(pose0, seLid(pose0, KEY_SE));
    const tgtS = mix3(Q.tgt, S.tgt, lie);
    const tgt = mix3(tgtS, keyW, dive);
    const dist = Math.exp(lerp(Math.log(lerp(Q.dist, S.dist, lie)), Math.log(0.95), dive));
    const cam = orbit(tgt, dist, lerp(lerp(Q.yaw, S.yaw, lie), 0.2, dive), lerp(lerp(Q.pitch, S.pitch, lie), 1.02, dive));
    const seOn = (i: number) => prog(bar, 3.3 + i * 0.25, 3.45 + i * 0.25, ease.outCubic) * (i === KEY_SE ? 0.8 : 0.4);
    const show: [number, number, number, number, number, number] = [up < 0.9 ? 1 : 0, up < 0.9 ? 1 : 0, 1, drop < 0.95 ? 1 : 0, drop < 0.95 ? 1 : 0, drop < 0.95 ? 1 : 0];
    const pose: DevicePose = {
      cam, tgt, fov: 0.6, rot, pos, explode, offs, lift: up * 2.4, show,
      sweep: t < down.start ? lerp(1.5, -1.5, prog(bar, 0.2, 2.2, ease.inOutQuad)) : lerp(-1.4, 1.4, prog(t, down.start + 1.2, this.ctx.end, ease.inOutQuad)),
      se: [seOn(0), seOn(1), seOn(2), seOn(3)],
    };
    const W3 = (q: V3) => this.dev.toWorld(pose, q);

    // ---- the lids: factory marks, and the key mark on the key's secure element once it lights
    const kKey = prog(bar, 3.45, 3.9, ease.inOutQuad);
    for (let i = 0; i < 4; i++) {
      this.dev.lids.draw(i, (c, lw, lh) => {
        c.fillStyle = LidAtlas.ETCH;
        c.beginPath(); c.arc(11, 11, 3.6, 0, Math.PI * 2); c.fill();
        c.font = font(F.mono(600), 8.5);
        c.fillText(`SE-${i + 1}`, 10, lh - 22);
        c.font = font(F.mono(500), 6.2);
        c.fillText('OK-SE  A7  2426', 10, lh - 12);
        if (i === KEY_SE && kKey > 0) {
          c.save();
          c.beginPath(); c.rect(0, lh * (1 - kKey), lw, lh * kKey); c.clip();
          c.fillStyle = LidAtlas.GLOW;
          c.fill(keyMarkPath(lw / 2, lh * 0.46, 44), 'evenodd');
          c.restore();
        }
      });
    }

    // ---- ground, device (depth of field as the macro comes in)
    const gc = projW(pose, tgt);
    studio(this.bg.ctx, gc.x, gc.y, 1, H * 0.9);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    const tex = this.dev.render(renderer, pose);
    const n = sub(W3([0, 0, 1]), W3([0, 0, 0]));
    comp.draw(renderer, this.macro.dof(renderer, tex, pose, keyW, keyW, n, 22 * prog(dive, 0.5, 1), 14), out);

    const c = this.text.ctx;
    const lb = this.lines;
    lb.clear();
    const bone = LIN.bone, sig = LIN.signal;
    const hx = DEVICE.w / 2, hy = DEVICE.h / 2;

    // ---- assembly rails: dashed hairlines through the stack's corners
    const rails = prog(bar, 0.9, 1.8, ease.inOutCubic) * (1 - prog(t, down.start - 0.2, down.start + 0.4));
    if (rails > 0) {
      const zt = this.partZ(0, pose) + 0.2, zb = this.partZ(5, pose) - 0.25;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = sx * (hx - 0.02), y = sy * (hy - 0.02);
        const nd = 46;
        for (let j = 0; j < nd; j += 2) {
          const u0 = j / nd, u1 = (j + 1) / nd;
          if (u0 > rails) break;
          const a = W3([x, y, lerp(zt, zb, u0)]), b = W3([x, y, lerp(zt, zb, Math.min(u1, rails))]);
          lb.seg(a[0], a[1], a[2], b[0], b[1], b[2], 1, bone[0] * 0.5, bone[1] * 0.5, bone[2] * 0.5, 0.8);
        }
      }
    }

    // ---- part labels: thin 3D leaders out to the right of the stack
    const la = 1 - prog(t, down.start - 0.3, down.start + 0.2);
    if (la > 0) {
      ORDER.forEach((i, j) => {
        const kj = prog(bar, 0.85 + j * 0.16, 1.35 + j * 0.16, ease.outCubic) * la;
        if (kj <= 0) return;
        const z = this.partZ(i, pose) - (i === 3 ? 0.016 : 0);
        const a = W3([hx - 0.06, i === 2 ? -0.1 : -0.2, z]);
        const e = W3([hx + 0.62, i === 2 ? -0.1 : -0.2, z]);
        const head = path3D(lb, [a, e], 0, Math.min(kj, 0.9999), 1.1, i === 2 ? sig : bone, i === 2 ? 1 : 0.75);
        glow3D(lb, a, 1.6, i === 2 ? sig : bone, 0.6 * kj);
        if (head && kj > 0.98) {
          const p = projW(pose, e);
          c.globalAlpha = prog(kj, 0.98, 1) * la;
          c.font = font(F.mono(500), 21);
          c.fillStyle = rgba('bone', 0.5);
          c.fillText(`0${j + 1}`, p.x + 12, p.y + 7);
          c.fillStyle = i === 2 ? rgba('signal') : rgba('bone', 0.9);
          c.fillText(PARTS[i]!, p.x + 50, p.y + 7);
          c.globalAlpha = 1;
        }
      });
    }

    // ---- the sung line, lying on the layers left of the stack
    const fam = F.archivo(100, 800);
    const groups: [number[], number, number][] = [[[0], 0, 0], [[1, 2], 1, 1], [[3, 4, 5], 2, 2]];
    const size = 0.22, lead = size * 1.2;
    const wa = prog(bar, 0.25, 0.8);
    for (const [idx, part, row] of groups) {
      const z = this.partZ(part, pose);
      // lyric3D steps row r down by r * lead: start that much higher so each row sits on its layer
      const o = W3([-hx - 0.12, -0.1 + row * lead, z]);
      const pl: Plane = { o, u: sub(W3([1, 0, z]), W3([0, 0, z])), v: sub(W3([0, 1, z]), W3([0, 0, z])) };
      const onBoard = part === 2;
      const fade = onBoard ? 1 - prog(dive, 0.75, 1) : 1 - prog(t, down.start - 0.2, down.start + 0.5);
      if (fade <= 0) continue;
      // lower rows appear only once their layer has come away from the one above (no stacked words)
      const sep = row === 0 ? 1 : prog(bar, 0.55 + 0.3 * row, 0.95 + 0.3 * row, ease.outCubic);
      lyric3D(c, pose, l2, t, pl, { family: fam, size, on: rgba('bone'), off: rgba('bone', 0.2), only: idx, align: 'right', pop: 0.06, alpha: wa * fade * sep, rows: [1, 3], leading: lead });
    }

    // ---- the key: a leader rising from its secure element
    const kl = prog(bar, 3.7, 4.15, ease.inOutCubic);
    if (kl > 0) {
      const a = W3(seLid(pose, KEY_SE, 0, 0.03));
      const b = W3(seLid(pose, KEY_SE, 0.05, 0.03));
      const p0 = W3([0, 0, 0]);
      const upv = n; // off the board
      const m: V3 = [b[0] + upv[0] * 0.14, b[1] + upv[1] * 0.14, b[2] + upv[2] * 0.14];
      const e: V3 = [m[0] + (b[0] - a[0]) * 3, m[1] + (b[1] - a[1]) * 3, m[2] + (b[2] - a[2]) * 3];
      void p0;
      const head = path3D(lb, [a, m, e], 0, Math.min(kl, 0.9999), 1.2, bone, 0.9);
      glow3D(lb, a, 2, sig, kl);
      if (head && kl > 0.97) {
        const p = projW(pose, e);
        c.globalAlpha = prog(kl, 0.97, 1);
        c.font = font(F.mono(500), 26);
        c.fillStyle = rgba('bone', 0.95);
        c.fillText('private key · never leaves', p.x + 14, p.y + 9);
        c.globalAlpha = 1;
      }
    }

    comp.draw(renderer, this.text.upload(), out);
    lb.render(renderer, out, camera3(pose));
    return { bloom: 0.45, vignette: 0.4 };
  }
}
