// `vault` (verse 2, lines 1–2) — docs/TREATMENT.md, a macro of the real main board (_device3d PARTS,
// _board: routed copper under a satin black mask, gold pads, 0402/0201 passives, the stamped fence
// round the secure zone), shallow depth of field (_macro):
//   "Four secure elements, EAL six plus": a low macro dolly along the four secure elements (the shot
//     hook's tail lands on, SE-1). Each lights on its word: a laser writes the sung word into its
//     lid ("Four", "secure", "elements", "EAL 6+") and the die's green shows through the etch; focus
//     follows the lit chip. On "EAL" a certification stamp comes down onto the board in front of the
//     row, and "six plus" sets its small print.
//   "Bank-card silicon, so you don't have to trust": the camera rises over the row; a bank card (a
//     smoked glass plate with its EMV contact pad) slides in over the lower board, the sung line
//     printed on it like the card's own lettering. Arcs of light run from its contact pad up and over
//     to each secure element on "silicon"; "trust" is struck through and `verify` is written above it
//     by a pen of light.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { strokeText, writtenLength, type StrokeText } from '../engine/stroke';
import type { Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { Device3D, SE_POS, orbit, seLid, type DevicePose, type V3 } from './_device3d';
import { LidAtlas } from './_board';
import { Macro } from './_macro';
import { camera3, fill3D, floor, glow3D, lyric3D, onPlane, path3D, projW, rrect3D, stroke3D, studio, text3D, width3D, type Plane } from './_space';

const EXP = 0.001; // "exploded" so only the board is drawn, but in place
const TOP = 0.006 + 0.28 * EXP + 0.025; // camera target height (kept: hook's tail lands on this pose)
const se = (i: number, dx = 0, dy = 0): V3 => [SE_POS[i]![0] + dx, SE_POS[i]![1] + 0.02 + dy, TOP];
const ROT: V3 = [0, -Math.PI / 2, 0]; // lying flat, display side up: device (x, y, z) -> world (x, z, -y)
const W3 = (q: V3): V3 => [q[0], q[2], -q[1]];
/** ID-1 card (85.6 × 54 mm) at 45 %, in device units, lying over the lower board. */
const CARD = { w: (85.6 / 53.1) * 0.45, h: (53.98 / 53.1) * 0.45, r: (3.18 / 53.1) * 0.45, x: 0, y: -0.43, lift: 0.07 };
const PAD = { x: -0.215, y: 0.04, w: 0.11, h: 0.085 };

export default class Vault extends Scene {
  dev = new Device3D();
  macro = new Macro();
  bg = new Layer2D();
  text = new Layer2D();
  lines = new LineBatch(20000, { screen2D: false, blend: 'add' });
  L: Line[] = [];
  verify!: StrokeText;

  override init() {
    this.L = ['Four secure elements', 'Bank-card silicon'].map((q) => this.ctx.lyrics.get(q));
    this.verify = strokeText('verify', 'script', 100);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [l1, l2] = this.L as [Line, Line];
    const t = f.t;
    const c2 = audio.timeOfBeat(Math.floor(audio.beatAt(l2.words[0]!.start + 0.02)));
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    const eal = wd(l1, 'eal');
    // the chips light on the line's words: Four, secure, elements, EAL
    const words = [l1.words[0]!, wd(l1, 'secure'), wd(l1, 'elements'), eal];
    const lit = words.map((w) => prog(t, w.start - 0.04, w.start + 0.25, ease.outCubic));

    // ---- camera: a low macro dolly along the row, then up over it (first pose = hook's tail)
    const up = prog(t, c2 - 0.3, c2 + 1.1, ease.inOutCubic);
    const glide = prog(t, this.ctx.start, c2, ease.inOutQuad);
    const p0: DevicePose = { cam: [0, 0, 1], tgt: [0, 0, 0], fov: 0.5, rot: ROT };
    const along = this.dev.toWorld(p0, se(0, lerp(0, SE_POS[3]![0] - SE_POS[0]![0], glide)));
    const over = W3([0, -0.36, TOP]);
    const tgt: V3 = [lerp(along[0], over[0], up), lerp(along[1], over[1], up), lerp(along[2], over[2], up)];
    const drift = prog(t, c2, this.ctx.end);
    const cam = orbit(tgt, lerp(0.62, lerp(1.62, 1.48, drift), up), lerp(0.5 - glide * 0.25, 0.04 - drift * 0.05, up), lerp(0.42, 1.08, up));
    const pose: DevicePose = {
      cam, tgt, fov: 0.55, rot: ROT, explode: EXP, show: [0, 0, 1, 0, 0, 0],
      se: lit.map((k, i) => k * (i === 0 ? 0.7 : 0.55)) as [number, number, number, number],
      sweep: t < c2 ? lerp(-1.3, 1.3, glide) : lerp(1.5, -1.5, prog(t, c2 + 0.4, this.ctx.end - 0.3, ease.inOutQuad)),
    };

    // ---- the lids: SE-n, then the sung word written in by a laser (it glows green once lit)
    const etch = ['Four', 'secure', 'elements', 'EAL 6+'];
    for (let i = 0; i < 4; i++) {
      const w = words[i]!;
      const k = prog(t, w.start - 0.02, i === 3 ? w.end : Math.min(w.end, w.start + 0.45), ease.inOutQuad);
      this.dev.lids.draw(i, (c, lw, lh) => {
        c.fillStyle = LidAtlas.ETCH;
        c.beginPath(); c.arc(11, 11, 3.6, 0, Math.PI * 2); c.fill();
        c.font = font(F.mono(600), 8.5);
        c.fillText(`SE-${i + 1}`, 10, lh - 22);
        c.font = font(F.mono(500), 6.2);
        c.fillText('OK-SE  A7  2426', 10, lh - 12);
        if (k <= 0) return;
        const fam = F.archivo(100, 800);
        let size = 26;
        c.font = font(fam, size);
        const tw = c.measureText(etch[i]!).width;
        if (tw > lw - 18) { size *= (lw - 18) / tw; c.font = font(fam, size); }
        const x0 = 9, y0 = lh * 0.56, ww = c.measureText(etch[i]!).width;
        c.save();
        c.beginPath(); c.rect(0, 0, x0 + ww * k, lh); c.clip();
        c.fillStyle = LidAtlas.GLOW;
        c.fillText(etch[i]!, x0, y0);
        c.restore();
        // the laser's spot, travelling along the word as it writes
        if (k < 1) { c.fillStyle = LidAtlas.GLOW; c.beginPath(); c.arc(x0 + ww * k, y0 - size * 0.35, 2.2, 0, Math.PI * 2); c.fill(); }
      });
    }

    // ---- ground and board, with the macro's depth of field
    const b = this.bg.ctx;
    const gc = projW(pose, tgt);
    studio(b, gc.x, gc.y, 1, H * 0.9);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    const devTex = this.dev.render(renderer, pose);
    const lidW = W3(seLid(pose, 0));
    const focus: V3 = [tgt[0], lidW[1], tgt[2]];
    comp.draw(renderer, this.macro.dof(renderer, devTex, pose, focus, lidW, [0, 1, 0], lerp(26, 4, up), 16), out);

    const c = this.text.ctx;
    this.text.clear();
    const lb = this.lines;
    lb.clear();
    const bone = LIN.bone, sig = LIN.signal;
    const boardY = lidW[1] - 0.016; // the board's top face (world y)

    // ---- the EAL 6+ stamp: comes down onto the board in front of the fourth chip
    {
      const kS = prog(t, eal.start - 0.12, eal.start + 0.1, ease.inCubic);
      const settle = prog(t, eal.start + 0.1, eal.start + 0.5, ease.outCubic);
      const fade = 1 - prog(t, c2 + 0.1, c2 + 0.7);
      if (kS > 0) {
        const cx = SE_POS[3]![0] - 0.02, cy = SE_POS[3]![1] + 0.02 - 0.2;
        const z = lerp(0.14, 0, kS) + (kS >= 1 ? 0.004 * (1 - settle) : 0);
        const pl: Plane = floor(W3([cx, cy, 0]).map((v, j) => (j === 1 ? boardY + 0.0015 + z : v)) as V3);
        const sw = 0.25, sh = 0.105;
        const a = clamp(kS * 2) * fade;
        const ring = (w: number, h: number, r: number) => rrect3D(pl, 0, 0, w, h, r, 6);
        path3D(lb, ring(sw, sh, 0.012), 0, 1, 2.2, [bone[0] * 0.9, bone[1] * 0.9, bone[2] * 0.9], a, true);
        path3D(lb, ring(sw - 0.014, sh - 0.014, 0.006), 0, 1, 1, [bone[0] * 0.7, bone[1] * 0.7, bone[2] * 0.7], a, true);
        c.globalAlpha = a;
        c.fillStyle = rgba('bone', 0.95);
        const fam = F.archivo(100, 900), size = 0.05;
        const tw = width3D('EAL 6+', fam, size);
        text3D(c, pose, 'EAL 6+', fam, size, pl, -tw / 2 - 0.004, 0);
        // the small print on "six plus"
        const six = wd(l1, 'six'), plus = wd(l1, 'plus');
        const k6 = prog(t, six.start - 0.05, plus.end, ease.linear);
        if (k6 > 0) {
          const small = 'COMMON CRITERIA  ·  CERTIFIED';
          const n = Math.round(small.length * k6);
          const fm = F.mono(500), ss = 0.0105;
          const sw2 = width3D(small, fm, ss);
          c.fillStyle = rgba('bone', 0.8);
          text3D(c, pose, small.slice(0, n), fm, ss, { ...pl, o: onPlane(pl, -sw2 / 2, -0.034) }, 0, 0);
        }
        c.globalAlpha = 1;
        // the impact: a ring of light spreading on the board as it lands
        const kI = prog(t, eal.start + 0.1, eal.start + 0.6, ease.outCubic);
        if (kI > 0 && kI < 1) path3D(lb, ring(sw + 0.1 * kI, sh + 0.1 * kI, 0.012 + 0.05 * kI), 0, 1, 1.2, bone, (1 - kI) * 0.6, true);
      }
    }

    // ---- line 2: the bank card over the lower board, the sung line printed on it
    if (up > 0) {
      const kIn = prog(t, c2 + 0.15, c2 + 1.0, ease.outExpo);
      if (kIn > 0) {
        const cx = lerp(-1.5, CARD.x, kIn), cy = CARD.y;
        const pl: Plane = floor([cx, boardY + CARD.lift, -cy]);
        // smoked glass: darkens the board under it so the lettering reads
        c.fillStyle = 'rgba(13,15,14,0.94)';
        fill3D(c, pose, rrect3D(pl, 0, 0, CARD.w, CARD.h, CARD.r, 6));
        path3D(lb, rrect3D(pl, 0, 0, CARD.w, CARD.h, CARD.r, 8), 0, 1, 1.8, bone, 1, true);
        // its thickness: the same outline on the underside, and a soft edge light
        path3D(lb, rrect3D(pl, 0, 0, CARD.w, CARD.h, CARD.r, 8, -0.006), 0, 1, 1, bone, 0.35, true);
        // the EMV contact pad: gold, with its contact divisions
        const pad = rrect3D(pl, PAD.x, PAD.y, PAD.w, PAD.h, 0.014, 5);
        c.fillStyle = 'rgba(176,140,78,0.9)';
        fill3D(c, pose, pad);
        const gold: [number, number, number] = [0.9, 0.62, 0.3];
        path3D(lb, pad, 0, 1, 1.2, gold, 1, true);
        const P = (x: number, y: number) => onPlane(pl, PAD.x + x * PAD.w / 2, PAD.y + y * PAD.h / 2, 0.0005);
        for (const [a, bb] of [[[0, -1], [0, 1]], [[-1, -1 / 3], [-0.25, -1 / 3]], [[-1, 1 / 3], [-0.25, 1 / 3]], [[0.25, -1 / 3], [1, -1 / 3]], [[0.25, 1 / 3], [1, 1 / 3]], [[-0.25, -0.6], [0.25, -0.6]], [[-0.25, 0.6], [0.25, 0.6]]] as [number, number][][])
          path3D(lb, [P(a[0]!, a[1]!), P(bb[0]!, bb[1]!)], 0, 0.9999, 1, [0.35, 0.24, 0.1], 1);
        // lettering: the sung line in two rows
        const fam = F.archivo(100, 800);
        const size = Math.min(0.05, (CARD.w - 0.1) / width3D('so you don’t have to trust', fam, 1));
        const tp: Plane = { ...pl, o: onPlane(pl, -CARD.w / 2 + 0.05, -0.075) };
        lyric3D(c, pose, l2, t, tp, { family: fam, size, on: rgba('bone'), off: rgba('bone', 0.22), rows: [2], leading: size * 1.25, pop: 0.012 });
        c.fillStyle = rgba('bone', 0.6);
        text3D(c, pose, 'EMV SECURE ELEMENT', F.mono(500), 0.014, { ...pl, o: onPlane(pl, PAD.x + PAD.w / 2 + 0.03, PAD.y - 0.005) });
        // "trust": struck through, `verify` written above it by a pen of light
        const tr = wd(l2, 'trust');
        const row2 = 'so you don’t have to trust';
        const lay = layout(row2, fam, 100);
        const g0 = lay.glyphs[row2.indexOf('trust')]!, g1 = lay.glyphs[row2.length - 1]!;
        const s = size / 100;
        const xa = -CARD.w / 2 + 0.05 + g0.x * s - 0.006, xb = -CARD.w / 2 + 0.05 + (g1.x + g1.w) * s + 0.006;
        const yr = -0.075 - size * 1.25 + size * 0.3;
        const kx = prog(t, tr.start + 0.05, tr.start + 0.25, ease.inOutCubic);
        if (kx > 0) {
          const a = onPlane(pl, xa, yr, 0.002), bb = onPlane(pl, lerp(xa, xb, kx), yr, 0.002);
          lb.seg(a[0], a[1], a[2], bb[0], bb[1], bb[2], 3.2, bone[0] * 1.3, bone[1] * 1.3, bone[2] * 1.3, 1);
        }
        const kv = prog(t, tr.start + 0.2, Math.min(this.ctx.end - 0.02, tr.start + 0.75), ease.inOutQuad);
        if (kv > 0) {
          const vs = size * 1.9 / 100;
          const vp: Plane = { ...pl, o: onPlane(pl, xa - 0.004, yr + size * 1.02, 0.003) };
          const head = stroke3D(lb, this.verify, this.verify.total * kv, vp, vs, 2.6, [sig[0] * 1.2, sig[1] * 1.2, sig[2] * 1.2]);
          if (head && kv < 1) glow3D(lb, head, 3, sig, 1);
        }
        // arcs of light: from the contact pad up and over to each secure element, on "silicon"
        const sil = wd(l2, 'silicon');
        const ka = prog(t, sil.start - 0.1, sil.end + 0.1, ease.inOutCubic);
        if (ka > 0) {
          const from = onPlane(pl, PAD.x, PAD.y + PAD.h / 2, 0.002);
          for (let i = 0; i < 4; i++) {
            const to = W3(seLid(pose, i, 0, -0.058));
            const pts: V3[] = [];
            for (let j = 0; j <= 32; j++) {
              const u = j / 32;
              const m: V3 = [lerp(from[0], to[0], u), lerp(from[1], to[1], u), lerp(from[2], to[2], u)];
              m[1] += Math.sin(u * Math.PI) * (0.06 + 0.025 * i);
              pts.push(m);
            }
            const ki = clamp(ka * 1.6 - i * 0.2);
            if (ki <= 0) continue;
            const head = path3D(lb, pts, 0, Math.min(ki, 0.9999), 1.3, [bone[0] * 0.75, bone[1] * 0.75, bone[2] * 0.75], 0.9);
            if (head && ki < 1) glow3D(lb, head, 2.4, bone, 0.8);
          }
        }
      }
    }

    comp.draw(renderer, this.text.upload(), out);
    lb.render(renderer, out, camera3(pose));
    return { bloom: 0.45, vignette: 0.42 };
  }
}
