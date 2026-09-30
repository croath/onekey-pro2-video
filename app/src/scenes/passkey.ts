// `passkey` (bridge + lift) — docs/TREATMENT.md, the real device and a corridor of doors in 3D lines:
//   "It's not just your coins anymore": the empty device `touch` left (same framing) wakes: its key
//     relights green on the screen; coin tickers (type, no logos) lift off the glass into the world
//     and drift away, fading. The line stands to the left. The camera pushes into the dark screen.
//   "It's the key to every door": out of the screen, a corridor of sign-in doors drawn in hairlines,
//     each a rounded frame of the device's proportions (the boundary, again) with rails running
//     between them; every door carries one sung word as its nameplate over `Sign in`, two fields and a
//     button. The camera flies down the corridor; each door swings open on its word.
//   "FIDO in your pocket, passkeys, no passwords to type": the real device rises out of the bottom of
//     the frame (the pocket) in front of the corridor, showing a passkey prompt; beside it, a password
//     field set in the world drops its dots one by one and `passkey` takes their place.
//   "Tap it once and you're in, no phishing link tonight": it springs on "Tap", the screen reads
//     `Signed in` on "in"; a hook on a 3D hairline drops onto it and bounces off its outline, the line
//     goes slack. The lift holds the key, bright, for chorus 2. The sung lines are set in the world.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, springStep, TAU } from '../engine/util';
import { DEVICE, keyMarkPath } from './_motifs';
import { Device3D, SCREEN, orbit, outline, type DevicePose, type V3 } from './_device3d';
import { add, camera3, fill3D, glow3D, lyric3D, onPlane, path3D, plane, rrect3D, studio, text3D, toW, type Plane } from './_space';

const bone = (a = 1) => rgba('bone', a);
type RGB = [number, number, number];
const sc = (k: number): RGB => [LIN.bone[0] * k, LIN.bone[1] * k, LIN.bone[2] * k];
const TH = DEVICE.t / 2;
/** The corridor: door frames (device proportions) every D along -z. */
const DOOR = { w: 1.5, h: 1.5 * DEVICE.h, r: 1.5 * DEVICE.corner, D: 2.4 };
/** `touch`'s last framing, so the cut is invisible. */
const TOUCH_END = { T: [-0.22, 0.02, 0] as V3, dist: 3.9, yaw: -0.18, pitch: 0.1, pos: [0.48, 0, 0] as V3, rot: [-0.3, 0, 0] as V3 };

export default class Passkey extends Scene {
  bg = new Layer2D();
  text = new Layer2D();
  dev = new Device3D();
  lines = new LineBatch(40000, { screen2D: false, blend: 'add' });
  outl = outline(120, 0.03);
  L: Line[] = [];

  override init() {
    this.L = ["It's not just your coins", "It's the key to every door", 'FIDO in your pocket', 'Tap it once'].map((q) => this.ctx.lyrics.get(q));
  }

  cutAt(l: Line) {
    const au = this.ctx.audio;
    return au.timeOfBeat(Math.floor(au.beatAt(l.words[0]!.start + 0.02)));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const [l1, l2, l3] = this.L as [Line, Line, Line, Line];
    const c2 = this.cutAt(l2), c3 = this.cutAt(l3);
    if (t3(f) >= c3) return this.fido(f, out);
    if (f.t >= c2) return this.corridor(f, out, l2, c2, c3);
    return this.coins(f, out, l1, c2);
  }

  /** Line 1: the empty device wakes; coins leave; the camera pushes into the screen. */
  coins(f: Frame, out: THREE.WebGLRenderTarget, l1: Line, c2: number) {
    const { renderer, comp } = this.ctx;
    const t = f.t, t0 = this.ctx.start;
    const wd = (q: string) => l1.words.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(q))!;
    const coins = wd('coins');
    const push = prog(t, c2 - 0.9, c2, ease.inCubic);
    const E = TOUCH_END;
    // the push lands centred on the screen
    const sw = prog(t, c2 - 1.6, c2, ease.inOutCubic);
    const scrW: V3 = [E.pos[0], 0, 0];
    const T: V3 = [lerp(E.T[0], scrW[0], sw), E.T[1], 0];
    const pose: DevicePose = {
      cam: orbit(T, lerp(E.dist, 0.45, push), lerp(E.yaw, -0.3, sw), lerp(E.pitch, 0.02, sw)), tgt: T, fov: 0.55,
      pos: E.pos, rot: [lerp(E.rot[0], -0.3, sw), 0, 0], screen: 1,
      sweep: lerp(-1.6, 1.6, prog(t, l1.words[0]!.start, coins.end, ease.inOutCubic)),
    };
    // screen: the key relights
    const s = this.dev.screen.ctx;
    this.dev.screen.clear(rgba('ink'));
    const kk = prog(t, l1.words[0]!.start - 0.1, l1.words[0]!.start + 0.5, ease.outCubic);
    s.globalAlpha = kk * (0.85 + 0.15 * f.a.kick);
    s.fillStyle = rgba('signal');
    s.fill(keyMarkPath(SCREEN.w / 2, SCREEN.h * 0.45, lerp(120, 200, kk)), 'evenodd');
    s.globalAlpha = 1;
    const cam = camera3(pose);
    const b = this.bg.ctx;
    const gc = this.dev.project(pose, [0, 0, 0]);
    studio(b, gc.x, gc.y);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    comp.draw(renderer, this.dev.render(renderer, pose), out);

    // the outline (touch's last line) holds, then fades as the screen wakes
    const LB = this.lines;
    LB.clear();
    const oa = 1 - prog(t, t0, l1.words[0]!.start + 0.8);
    if (oa > 0) path3D(LB, toW(this.dev, pose, this.outl), 0, 1, 1.5, sc(oa), 1, true);
    // coin tickers leave the glass: streaks behind each
    const glyphs = ['BTC', 'ETH', 'SOL', 'USDT', 'BTC', 'ETH', 'SOL'];
    const c = this.text.ctx;
    this.text.clear();
    glyphs.forEach((g, i) => {
      const tb = coins.start - 0.5 + i * 0.16;
      const k = prog(t, tb, tb + 2.4, ease.outCubic);
      if (k <= 0 || k >= 1) return;
      const a = (i / glyphs.length) * TAU + 0.5;
      const start = this.dev.toWorld(pose, [Math.cos(a) * 0.15, -0.25 + Math.sin(a) * 0.2, TH + 0.01]);
      const dir: V3 = [Math.cos(a) * 1.3 - 0.4, Math.sin(a) * 0.9 + 0.2, 0.9 + 0.5 * hash(i, 2)];
      const p = add(start, [dir[0] * k * 1.8, dir[1] * k * 1.8, dir[2] * k * 1.8]);
      const pb = add(start, [dir[0] * Math.max(0, k - 0.12) * 1.8, dir[1] * Math.max(0, k - 0.12) * 1.8, dir[2] * Math.max(0, k - 0.12) * 1.8]);
      const al = Math.min(1, k * 5) * (1 - k);
      LB.seg(...pb, ...p, 1.1, ...sc(0.7 * al), 1);
      c.fillStyle = bone(0.9 * al);
      text3D(c, pose, g, F.mono(500), 0.12, plane(p, -0.2));
    });
    if (LB.count) LB.render(renderer, out, camera3(pose)); // (camera3 is shared: re-aim it after the corridor)
    lyric3D(c, pose, l1, t, plane([-0.1, 0.25, 0.1], -0.25), {
      family: F.archivo(100, 800), size: 0.16, on: bone(), off: bone(0.2), rows: [3], leading: 0.21, align: 'right',
      alpha: prog(t, t0, t0 + 0.4) * (1 - push),
    });
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.42, vignette: 0.42, fade: prog(t, c2 - 0.12, c2) * 0.9 };
  }

  /** Door i's frame plane (at z = -i D). */
  doorPlane(i: number): Plane {
    return plane([0, 0, -i * DOOR.D]);
  }

  /** Draw the corridor's doors into the batch (and nameplates into `c`); doors open at `opens[i]`. */
  drawDoors(LB: LineBatch, c: CanvasRenderingContext2D | null, pose: DevicePose, t: number, words: string[], opens: number[], camZ: number, dim = 1) {
    const n = words.length;
    for (let i = n + 2; i >= 0; i--) {
      const z = -i * DOOR.D;
      const dz = camZ - z; // distance in front of the camera
      if (dz < 0.25) continue;
      const a = dim * clamp((dz - 0.25) / 0.6) * Math.exp(-Math.max(0, dz - 1.5) / (dim < 1 ? 7 : 2.6));
      if (a < 0.01) continue;
      const pl = this.doorPlane(i);
      // the frame, doubled (a thickness), and rails to the next door
      const fr = rrect3D(pl, 0, 0, DOOR.w, DOOR.h, DOOR.r, 8);
      path3D(LB, fr, 0, 1, 1.3, sc(0.8 * a), 1, true);
      const fr2 = rrect3D(pl, 0, 0, DOOR.w, DOOR.h, DOOR.r, 8, -0.12);
      path3D(LB, fr2, 0, 1, 1, sc(0.35 * a), 1, true);
      for (const j of [4, 13, 22, 31]) {
        const p = fr[j]!, q = add(p, [0, 0, -DOOR.D]);
        LB.seg(...p, ...q, 1, ...sc(0.22 * a), 1);
      }
      if (i >= n) continue;
      // the door panel, swinging open about its left edge (away from the camera)
      const op = opens[i]!;
      const k = prog(t, op - 0.05, op + 0.55, ease.outCubic);
      const ang = k * 1.5;
      const hinge: V3 = [-DOOR.w / 2 + 0.05, 0, z - 0.02];
      const u: V3 = [Math.cos(ang), 0, -Math.sin(ang)];
      const pp: Plane = { o: hinge, u, v: [0, 1, 0] };
      const pw = DOOR.w - 0.1, ph = DOOR.h - 0.1;
      path3D(LB, rrect3D(pp, pw / 2, 0, pw, ph, DOOR.r - 0.05, 8), 0, 1, 1.4, sc(1.0 * a), 1, true);
      // the sign-in form: two fields, a button
      for (let fi = 0; fi < 2; fi++) path3D(LB, rrect3D(pp, pw / 2, 0.15 - fi * 0.42, pw - 0.36, 0.22, 0.05, 4), 0, 1, 1, sc(0.6 * a), 1, true);
      path3D(LB, rrect3D(pp, pw / 2, -0.85, pw - 0.36, 0.22, 0.11, 6), 0, 1, 1.2, sc(0.9 * a), 1, true);
      // password dots
      if (dz > 1) for (let d = 0; d < 8; d++) {
        const p = onPlane(pp, 0.3 + d * 0.1, -0.27);
        glow3D(LB, p, 1.1 / Math.max(0.6, dz / 2.5), LIN.bone, 0.25 * a);
      }
      if (c) {
        // the nameplate: the sung word, and `Sign in`
        // only the doors just ahead carry readable plates
        const vis = clamp((dz - 1.2) / 0.5) * clamp((2.3 * DOOR.D - dz) / DOOR.D);
        c.fillStyle = bone(a * vis * (t >= op - 0.3 ? 1 : 0.35));
        text3D(c, pose, words[i]!, F.archivo(100, 800), 0.34, { o: onPlane(pp, 0.18, 0.72), u: pp.u, v: pp.v });
        c.fillStyle = bone(0.6 * a * vis);
        text3D(c, pose, 'Sign in', F.mono(500), 0.09, { o: onPlane(pp, 0.2, 0.45), u: pp.u, v: pp.v });
        text3D(c, pose, 'password', F.mono(400), 0.06, { o: onPlane(pp, 0.2, -0.08), u: pp.u, v: pp.v });
      }
    }
  }

  corridor(f: Frame, out: THREE.WebGLRenderTarget, l2: Line, c2: number, c3: number) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const words = l2.words.map((w) => w.w.replace(/[^A-Za-z’']/g, ''));
    const opens = l2.words.map((w) => w.start);
    // the camera passes door i a little after it opens
    const knots = opens.map((o, i) => [o + 0.45, -i * DOOR.D + 0.6] as [number, number]);
    knots.unshift([c2, 2.6]);
    knots.push([c3 + 0.3, -(words.length) * DOOR.D + 2.2]);
    let camZ = knots[0]![1];
    for (let i = 0; i < knots.length - 1; i++) {
      const [ta, za] = knots[i]!, [tb, zb] = knots[i + 1]!;
      if (t >= ta) camZ = lerp(za, zb, ease.inOutQuad(clamp((t - ta) / (tb - ta))));
    }
    const sway = Math.sin(t * 0.9) * 0.12;
    const pose: DevicePose = { cam: [0.25 + sway, 0.1, camZ], tgt: [-0.1 + sway * 0.5, -0.02, camZ - 3], fov: 0.8 };
    const b = this.bg.ctx;
    studio(b, W / 2, H / 2, 0.8);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    const LB = this.lines;
    LB.clear();
    this.text.clear();
    const c = this.text.ctx;
    this.drawDoors(LB, c, pose, t, words, opens, camZ);
    // floor lines along the corridor
    const yF = -DOOR.h / 2 - 0.02;
    for (let x = -3; x <= 3; x++) LB.seg(x * 0.5, yF, 3, x * 0.5, yF, -20, 1, ...sc(0.08), 1);
    LB.render(renderer, out, camera3(pose));
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.42, vignette: 0.45, fade: 0.9 * (1 - prog(t, c2, c2 + 0.25)) };
  }

  /**
   * "FIDO in your pocket, passkeys, no passwords to type": the real device rises out of the bottom of
   * the frame (the pocket) in front of the corridor, showing a passkey prompt; beside it a password
   * field set in the world drops its dots and `passkey` takes their place. "Tap it once and you're
   * in": it springs on "Tap", the screen reads `Signed in` on "in". "no phishing link tonight": a hook
   * on a 3D hairline drops onto it and bounces off its outline; the line goes slack. The lift: the
   * screen's key glows up into chorus 2.
   */
  fido(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const [, l2, l3, l4] = this.L as [Line, Line, Line, Line];
    const t = f.t;
    const wd = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(q))!;
    const c3 = this.cutAt(l3), c4 = this.cutAt(l4);
    const pocket = wd(l3, 'pocket'), pk = wd(l3, 'passkeys'), ty = wd(l3, 'type');
    const tap = wd(l4, 'tap'), inW = l4.words.find((w) => w.w.startsWith('in,'))!;
    const ph = wd(l4, 'phishing'), link = wd(l4, 'link');
    const lastW = l4.words[l4.words.length - 1]!;
    const lift = prog(t, lastW.end, this.ctx.end, ease.inCubic);
    void audio;

    // ---- the device
    const rise = prog(t, c3, pocket.end, ease.outCubic);
    const centre = prog(t, inW.start + 0.2, ph.start - 0.1, ease.inOutCubic);
    const sp = t > tap.start ? springStep(t - tap.start, 4, 0.3) : 0;
    const press = t > tap.start ? Math.sin(Math.min(1, (t - tap.start) / 0.14) * Math.PI) : 0;
    const bounce = t > link.start ? Math.sin(Math.min(1, (t - link.start) / 0.25) * Math.PI) * Math.exp(-(t - link.start) / 0.5) : 0;
    const rebound = t > link.start ? ease.outCubic(prog(t, link.start, link.start + 0.6)) : 0;
    const T: V3 = [lerp(-0.2, 0, centre), 0.3 * centre, 0];
    const pose: DevicePose = {
      cam: orbit(T, lerp(5.2, 5.3, prog(t, c3, this.ctx.end)), lerp(-0.12, 0, centre), 0.05), tgt: T, fov: 0.5,
      pos: [lerp(0.95, 0, centre), lerp(-2.8, 0.1, rise) - bounce * 0.04, 0],
      rot: [lerp(-0.35, 0, centre), lerp(0.1, 0, rise), lerp(0.25, 0.04, rise)],
      scale: 1 - 0.06 * press + (t > tap.start ? (sp - 1) * 0.02 : 0),
      screen: 1, sweep: lerp(-1.5, 1.5, prog(t, tap.start, tap.start + 0.8, ease.inOutCubic)),
    };
    // its screen: the passkey prompt, then signed in
    const s = this.dev.screen.ctx;
    this.dev.screen.clear(rgba('ink'));
    const signed = t >= inW.start;
    s.font = font(F.mono(500), 28);
    s.fillStyle = bone(0.55);
    s.fillText('FIDO2 · passkey', 44, 70);
    const mh = lerp(180, 230, lift);
    s.fillStyle = rgba('signal');
    s.globalAlpha = 0.85 + 0.15 * f.a.kick;
    s.fill(keyMarkPath(SCREEN.w / 2, SCREEN.h * 0.36, mh), 'evenodd');
    s.globalAlpha = 1;
    s.font = font(F.archivo(100, 800), 60);
    s.fillStyle = bone();
    s.fillText(signed ? 'Signed in' : 'Sign in?', 44, SCREEN.h * 0.6);
    s.font = font(F.mono(400), 30);
    s.fillStyle = bone(0.6);
    s.fillText('example.com', 44, SCREEN.h * 0.6 + 56);
    const ring = t > tap.start ? prog(t, tap.start, tap.start + 0.5, ease.outCubic) : 0;
    const bx = SCREEN.w / 2, by = SCREEN.h * 0.84;
    s.fillStyle = signed ? rgba('signal') : bone(0.12);
    s.beginPath(); s.roundRect(44, by - 52, SCREEN.w - 88, 104, 52); s.fill();
    if (ring > 0 && ring < 1) {
      s.strokeStyle = rgba('signal', 1 - ring);
      s.lineWidth = 6;
      s.beginPath(); s.arc(bx, by, 40 + ring * 220, 0, TAU); s.stroke();
    }
    s.font = font(F.archivo(100, 700), 38);
    s.fillStyle = signed ? rgba('ink') : bone(0.85);
    const lb = signed ? 'Done' : 'Tap to approve';
    s.fillText(lb, bx - s.measureText(lb).width / 2, by + 13);

    const cam = camera3(pose);
    const b = this.bg.ctx;
    const gc = this.dev.project(pose, [0, 0, 0]);
    studio(b, gc.x, H / 2, 1, H * 0.85, [24, 27 + Math.round(40 * lift), 25]);
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    // the corridor stays on behind, all doors open, dim
    const LB = this.lines;
    LB.clear();
    const words = l2.words.map((w) => w.w.replace(/[^A-Za-z’']/g, ''));
    const corr: DevicePose = { ...pose, cam: [pose.cam[0], pose.cam[1], pose.cam[2] - 4], tgt: [pose.tgt[0], pose.tgt[1], pose.tgt[2] - 4] };
    this.drawDoors(LB, null, corr, t, words, words.map(() => -99), corr.cam[2] + 1.2, 0.35 * (1 - lift));
    LB.render(renderer, out, camera3(corr));
    comp.draw(renderer, this.dev.render(renderer, pose), out);

    // ---- in front: the password field (world), the hook
    LB.clear();
    const c = this.text.ctx;
    this.text.clear();
    const pa = prog(t, c3 + 0.1, c3 + 0.5) * (1 - centre) * (1 - prog(t, c4 - 0.3, c4));
    const fp: Plane = plane([-1.95, -0.3, 0.4], 0.12);
    if (pa > 0) {
      path3D(LB, rrect3D(fp, 0.8, 0, 1.6, 0.3, 0.06, 6), 0, 1, 1.4, sc(0.8 * pa), 1, true);
      c.fillStyle = bone(0.6 * pa);
      text3D(c, pose, 'password', F.mono(400), 0.075, { o: onPlane(fp, 0, 0.24), u: fp.u, v: fp.v });
      const drop = prog(t, pk.start, ty.end, ease.linear);
      c.fillStyle = bone(0.9 * pa);
      for (let j = 0; j < 10; j++) {
        const kd = clamp((drop - j / 10) * 10);
        if (kd >= 1) continue;
        const cx = 0.16 + j * 0.12, cy = -1.4 * kd * kd, z = 0.3 * kd;
        const circ: V3[] = Array.from({ length: 10 }, (_, q) => onPlane(fp, cx + 0.028 * Math.cos(q * 0.628), cy + 0.028 * Math.sin(q * 0.628), z));
        c.globalAlpha = 1 - kd;
        fill3D(c, pose, circ);
        c.globalAlpha = 1;
      }
      const kk = prog(t, ty.start, ty.start + 0.3, ease.outExpo);
      if (kk > 0) {
        c.fillStyle = bone(pa * kk);
        text3D(c, pose, 'passkey · no password', F.mono(500), 0.085, { o: onPlane(fp, 0.14, -0.035), u: fp.u, v: fp.v });
      }
    }
    // the hook: drops onto the device's outline and bounces off
    const ow = toW(this.dev, pose, this.outl);
    if (t > ph.start - 0.3) {
      const top = this.dev.toWorld(pose, [0.1, DEVICE.h / 2 + 0.03, TH + 0.25]);
      const slack = prog(t, link.end, link.end + 0.9, ease.inCubic);
      const kDown = prog(t, ph.start - 0.2, link.start, ease.inCubic);
      const hx = top[0] + slack * 1.2;
      const hy = lerp(top[1] + 2.2, top[1] + 0.02, kDown) + rebound * 0.45 + slack * 0.8;
      const hz = top[2];
      const la = 1 - slack;
      // the line, from above frame, sagging once slack
      const pts: V3[] = [];
      for (let q = 0; q <= 16; q++) {
        const u = q / 16;
        pts.push([lerp(hx, hx, u) + Math.sin(u * Math.PI) * slack * 0.5, lerp(top[1] + 3.5, hy + 0.4, u) - Math.sin(u * Math.PI) * slack * 0.6, hz]);
      }
      path3D(LB, pts, 0, 1, 1.2, sc(0.9 * la), 1);
      // the shank and bend
      const R = 0.12;
      const hook: V3[] = [[hx, hy + 0.4, hz], [hx, hy + R, hz]];
      for (let q = 0; q <= 14; q++) { const a = (q / 14) * Math.PI * 0.95; hook.push([hx - R + Math.cos(a) * R, hy + R - Math.sin(a) * R, hz]); }
      hook.push([hx - 2 * R + 0.02, hy + R + 0.1, hz]);
      hook.push([hx - 2 * R + 0.07, hy + R + 0.04, hz]);
      path3D(LB, hook, 0, 1, 2.4, sc(1.1 * la), 1);
      // the boundary flashes where it was struck
      if (t > link.start && t < link.start + 0.4) {
        const kf = 1 - (t - link.start) / 0.4;
        path3D(LB, ow, 0, 1, 2.2, sc(1.3 * kf), 1, true);
      }
    }
    if (LB.count) LB.render(renderer, out, camera3(pose)); // (camera3 is shared: re-aim it after the corridor)

    // ---- the sung lines in the world: line 3 above the field; line 4 left of the device once centred
    const fam = F.archivo(100, 800);
    if (t < c4 + 0.3) {
      const a = prog(t, c3, c3 + 0.4) * (1 - prog(t, c4 - 0.1, c4 + 0.3));
      lyric3D(c, pose, l3, t, { o: onPlane(fp, 0, 0.95), u: fp.u, v: fp.v }, { family: fam, size: 0.18, on: bone(), off: bone(0.2), rows: [4, 6], leading: 0.24, alpha: a });
    }
    if (t >= c4 - 0.1) {
      const a = prog(t, c4 - 0.1, c4 + 0.3) * (1 - lift);
      lyric3D(c, pose, l4, t, plane([-0.72, 0.4, 0.2], 0), { family: fam, size: 0.17, on: bone(), off: bone(0.2), rows: [3, 6, 8], leading: 0.23, align: 'right', alpha: a });
    }
    comp.draw(renderer, this.text.upload(), out);
    void glow3D;
    return { bloom: 0.45 + 0.3 * lift, vignette: 0.4, exposure: 1 + 0.4 * lift };
  }
}

const t3 = (f: Frame) => f.t;
