// `hook` ×2 (the choruses) — docs/TREATMENT.md. One module, two entries: params.n = 1 | 2.
// One continuous 3D world around the real device (_device3d): the camera never cuts, it flies from shot
// to shot, and the lyrics live in that world (type slabs, writing light, cells, code), never as captions.
//   "Keep your keys at home": the camera rushes down a tunnel of hairline rings (the device's outline,
//     the boundary) towards the device, far away and dark. KEEP / YOUR / KEYS / AT are slabs of type
//     standing in the tunnel, each landing on its word as the camera flies past it. On "home" the
//     rings collapse onto the device's outline, the screen wakes with the green key, HOME stands behind.
//   "Only the signatures go": the camera orbits to three-quarter. "Only" stands beside the device; "the
//     signatures go" is written in light by a pen whose line runs out of the screen (the key stays on
//     it). On "signatures" and "go" signatures leave the device as hairlines that fly past the camera;
//     on "go" the written line itself peels off and flies away.
//   "Twenty-four words the internet will never know": 24 glass tiles spray out of the screen into a
//     6 × 4 grid, centred across the device; the sung words fill their cells in order, the rest stay
//     masked (never a real recovery word). From "never" the tiles flip over one by one and fall back
//     into the screen, "never" and "know" last.
//   n=2 only, "Open source, read every line": the firmware (illustrative code, our own) unrolls out of
//     the screen onto a sheet in space, each line tied to its row on the screen by a hairline; the
//     lyric is typed as the sheet's first line, a comment.
//   "One key (OneKey), all yours": macro on the glass. A hairline "1" falls onto the screen on "One"
//     and lands as the green "1"; the "O" on "key"; each landing sends a ripple to the outline. On
//     "OneKey" the camera pulls back to three-quarter and the name stands beside the device.
//   "Hold it, sign it, go": low hero angle; HOLD IT / SIGN IT / GO slam onto a plane behind the device.
//     It pops up on "Hold" (the screen's hold-to-sign ring fills), shows "Signed" on "sign", spins on
//     "go" as a burst of signatures leaves.
//   n=1 tail: the device lies back, its cover glass and display lift off past the camera, and the camera
//     comes down on the first secure element: `vault` starts there.
//   n=2 tail: the spin settles into `end`'s first pose (back, three-quarter) while the studio lights go
//     down from bone to ink, so the break's turntable follows without a cut.
// n=1: bone on ink, glowing hairlines. n=2: ink on a bone studio cyclorama, ink hairlines. The key is
// green, and green stays on the device's screen.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { strokeText, writtenLength, type StrokeText } from '../engine/stroke';
import { clamp, ease, hash, lerp, prog, springStep, TAU } from '../engine/util';
import { DEVICE, KEY, keyMarkPath, keyPt } from './_motifs';
import { Device3D, SCREEN, SCREEN_DU, SE_POS, orbit, outline, type DevicePose, type V3 } from './_device3d';
import { basis, camera3, cross, lyric3D, norm, onPlane, plane, projW, stroke3D, text3D, width3D, type Plane } from './_space';
import { LOOK, Lines, bez, fiber, poseMix, slab3D, smooth, wireMark, type Look, type RGB } from './_hookkit';

const CODE = [
  '// ',
  'fn sign(tx: &Tx) -> Result<Signature> {',
  '    let key = secure_element::slot(0)?;',
  '    ui::show_plain(tx)?;',
  '    ui::confirm()?;',
  '    let sig = key.sign(tx.digest())?;',
  '    Ok(sig) // the key stays in the chip',
  '}',
  '',
  'fn export_key() -> ! {',
  '    unreachable!("keys stay home")',
  '}',
];

/** Tunnel: rings of the device outline, scaled up, from far behind the device to far in front. */
const RING = { s: 2.7, z0: -22, z1: 36, step: 1.8 };
/** The 24-cell grid (world units), centred in front of the device. */
const GRID = { cols: 6, rows: 4, w: 0.62, h: 0.24, gx: 0.045, gy: 0.045, z: 0.75, r: 0.03 };
/** The key mark on the screen: height and centre in screen px. */
const MARK = { h: 300, cy: 0.47 };
/** Screen px -> device units. */
const PXU = SCREEN_DU.w / SCREEN.w;
const screenPt = (px: number, py: number, z = DEVICE.t / 2 + 0.002): V3 => [(px - SCREEN.w / 2) * PXU, (SCREEN.h / 2 - py) * PXU, z];

type Shot = 'keep' | 'only' | 'twenty' | 'open' | 'one' | 'hold';

export default class Hook extends Scene {
  dev = new Device3D();
  bg = new Layer2D();
  back = new Layer2D();
  front = new Layer2D();
  lines!: Lines;
  look!: Look;
  n: 1 | 2 = 1;
  keep!: Line; only!: Line; twenty!: Line; one!: Line; hold!: Line; open: Line | null = null;
  sig!: StrokeText;
  sigTimes: [number, number][] = [];
  /** camera cut (start) of each shot */
  cut: Record<Shot, number> = { keep: 0, only: 0, twenty: 0, open: 0, one: 0, hold: 0 };
  ringPts = outline(64, 0);

  override init() {
    const ly = this.ctx.lyrics;
    this.n = this.ctx.params.n === 2 ? 2 : 1;
    this.look = LOOK[this.n];
    this.lines = new Lines(this.look);
    const k = this.n - 1;
    this.keep = ly.get('Keep your keys at home', k);
    this.only = ly.get('Only the signatures go', k);
    this.twenty = ly.get('Twenty-four words', k);
    this.one = ly.get('One key', k);
    this.hold = ly.get('Hold it, sign it', k);
    if (this.n === 2) this.open = ly.get('Open source');
    // "the signatures go", written by a pen: each char while its word is sung
    const words = this.only.words.slice(1);
    this.sig = strokeText(words.map((w) => w.w).join(' '), 'script', 100);
    words.forEach((w, i) => {
      for (const _ of w.w) this.sigTimes.push([w.start, w.end]);
      if (i < words.length - 1) this.sigTimes.push([w.end, w.end]);
    });
    const beat = (t: number) => this.ctx.audio.timeOfBeat(Math.floor(this.ctx.audio.beatAt(t + 0.02)));
    this.cut = {
      keep: this.ctx.start,
      only: this.only.words[0]!.start - 0.1,
      twenty: beat(this.twenty.words[0]!.start),
      open: this.open ? beat(this.open.words[0]!.start) : Infinity,
      // n=2: "line" must be read before the push, so the push is quicker
      one: this.one.words[0]!.start - (this.open ? 0.42 : 0.9),
      hold: beat(this.hold.words[0]!.start),
    };
  }

  word(l: Line, q: string) { return l.words.find((w) => w.w.toLowerCase().replace(/[^a-z-]/g, '').startsWith(q))!; }

  // ------------------------------------------------------------------ camera
  /** Camera z along the tunnel in the first shot. */
  zc(t: number) {
    const w = this.keep.words;
    const home = w[4]!.start;
    return smooth(t, [[this.cut.keep - 0.2, 34], [w[0]!.start, 24], [w[1]!.start, 19.2], [w[2]!.start, 15], [w[3]!.start, 9.6], [home, 6.2], [home + 0.8, 4.7]]);
  }

  shotPose(s: Shot, t: number): DevicePose {
    const L = this;
    if (s === 'keep') {
      const z = this.zc(t);
      const u = prog(t, this.cut.keep, this.keep.words[4]!.start + 0.8);
      return { cam: [lerp(0.2, 0, ease.inOutQuad(u)), lerp(0.25, 0.12, u), z], tgt: [0, 0.02, 0], fov: 0.55, rot: [lerp(0.25, 0, ease.outCubic(u)), 0, 0], screen: 0 };
    }
    if (s === 'only') {
      const e = prog(t, this.cut.only, this.cut.twenty + 0.4, ease.inOutCubic);
      const tgt: V3 = [lerp(0, 0.85, e), lerp(0.02, 0.05, e), 0];
      return { cam: orbit(tgt, lerp(4.7, 5.5, e), lerp(0, 0.34, e), lerp(0.025, 0.07, e)), tgt, fov: 0.55, rot: [lerp(0, 0.08, e), 0, 0], screen: 1 };
    }
    if (s === 'twenty') {
      // straight on, a slow glide across the grid; at the end it pushes towards the screen
      const u = prog(t, this.cut.twenty, this.cut.one + 0.9);
      const tgt: V3 = [0, 0, GRID.z];
      return { cam: orbit(tgt, 5.1, lerp(-0.1, 0.08, ease.inOutQuad(u)), lerp(0.06, 0.02, u)), tgt, fov: 0.55, rot: [0, 0, 0], screen: 1 };
    }
    if (s === 'open') {
      const u = prog(t, this.cut.open, this.cut.one + 0.4, ease.inOutQuad);
      const tgt: V3 = [lerp(0.9, 1.15, u), 0.05, 0];
      return { cam: orbit(tgt, 5.6, lerp(-0.3, -0.2, u), 0.05), tgt, fov: 0.55, rot: [0.5, 0, 0], screen: 1 };
    }
    if (s === 'one') {
      // macro on the glass, then (on "OneKey") back to three-quarter with the name beside it
      const ok = this.one.words[2]!;
      const push = prog(t, this.cut.one, this.one.words[0]!.start + 0.05, ease.inOutCubic);
      const back = prog(t, ok.start - 0.1, ok.start + 0.9, ease.inOutCubic);
      const yours = prog(t, this.one.words[3]!.start, this.hold.words[0]!.start, ease.inOutQuad);
      const tgt: V3 = [lerp(0, 0.95, back), lerp(0.05, 0.03, back), 0];
      const d = lerp(lerp(5.1, 2.35, push), 5.3, back);
      return { cam: orbit(tgt, d - yours * 0.25, lerp(0, 0.3, back), lerp(0.02, 0.06, back)), tgt, fov: 0.55, rot: [lerp(0, 0.5, back) + yours * 0.12, lerp(0, 0.04, back), 0], screen: 1 };
    }
    // hold
    const hw = this.hold.words;
    const hold = hw[0]!, go = hw[hw.length - 1]!;
    const u = prog(t, this.cut.hold, go.start + 0.9, ease.inOutQuad);
    const pop = t >= hold.start ? springStep(t - hold.start, 2.6, 0.42) : 0;
    const spin = prog(t, go.start - 0.05, go.start + 0.95, ease.inOutCubic);
    const tgt: V3 = [0, lerp(0.02, 0.12, u), 0];
    let p: DevicePose = {
      cam: orbit(tgt, lerp(5.4, 5.0, u), lerp(0.3, -0.12, u), lerp(-0.02, -0.1, u)), tgt, fov: 0.55,
      pos: [0, 0.1 * clamp(pop), 0.35 * clamp(pop)], scale: lerp(0.88, 1, clamp(pop)),
      rot: [lerp(0.35, -0.12, u) - spin * TAU, lerp(0.02, 0.1, u), lerp(0.05, 0, u)], screen: 1,
    };
    const tail = go.end;
    if (this.n === 1) {
      // lie back; the glass lifts off; down onto the first secure element (vault's first pose)
      const lie = prog(t, tail + 0.9, this.ctx.end, ease.inOutCubic);
      if (lie > 0) {
        const rot: V3 = [0, -Math.PI / 2, 0];
        const TOP = 0.006 + 0.28 * 0.001 + 0.025;
        const se0: V3 = [SE_POS[0]![0], SE_POS[0]![1] + 0.02, TOP];
        const tv = L.dev.toWorld({ cam: [0, 0, 1], tgt: [0, 0, 0], fov: 0.5, rot }, se0);
        const vault: DevicePose = { cam: orbit(tv, 0.62, 0.5, 0.42), tgt: tv, fov: 0.55, rot, screen: 0 };
        const mid: DevicePose = { ...p, rot: [-0.12 - TAU, 0.1, 0], pos: [0, 0.1, 0.35], scale: 1 };
        // unwind the spin so the blend doesn't turn it back
        mid.rot = [-0.12, 0.1, 0];
        p = poseMix({ ...mid }, { ...vault, pos: [0, 0, 0], scale: 1 }, lie);
        p.rot = [lerp(-0.12, 0, lie), lerp(0.1, -Math.PI / 2, lie), 0];
      } else p.rot = [p.rot![0] + (spin >= 1 ? TAU : 0), p.rot![1], p.rot![2]];
    } else {
      // settle into end's first pose: back three-quarter, lights going down
      const e = prog(t, go.start - 0.05, this.ctx.end, ease.inOutCubic);
      const endPose: DevicePose = { cam: [0, 0.35, 4.3], tgt: [0, 0, 0], fov: 0.55, pos: [0, 0, 0], rot: [-Math.PI * 1.35, 0.18, 0.04], scale: 1, screen: 0 };
      const settle = prog(t, go.start + 0.2, this.ctx.end, ease.inOutCubic);
      p = poseMix(p, endPose, settle);
      p.rot = [lerp(0.35 - 0.47 * clamp(u / 1), -Math.PI * 1.35, e), lerp(p.rot![1], 0.18, settle), lerp(p.rot![2], 0.04, settle)];
    }
    return p;
  }

  shotAt(t: number): Shot {
    const order: Shot[] = ['keep', 'only', 'twenty', 'open', 'one', 'hold'];
    let s: Shot = 'keep';
    for (const o of order) if (t >= this.cut[o]) s = o;
    return s;
  }

  pose(t: number): DevicePose {
    const s = this.shotAt(t);
    const p = this.shotPose(s, t);
    const prev: Record<Shot, Shot> = { keep: 'keep', only: 'keep', twenty: 'only', open: 'twenty', one: this.open ? 'open' : 'twenty', hold: 'one' };
    const blend: Record<Shot, number> = { keep: 0.01, only: 0.5, twenty: 0.9, open: 0.9, one: 0.01, hold: 0.8 };
    const k = prog(t, this.cut[s], this.cut[s] + blend[s], ease.inOutCubic);
    return k < 1 ? poseMix(this.shotPose(prev[s], t), p, k) : p;
  }

  // ------------------------------------------------------------------ the screen
  drawScreen(t: number): number {
    const sc = this.dev.screen.ctx;
    const hw = this.hold.words, one = this.one.words;
    const home = this.keep.words[4]!;
    this.dev.screen.clear(rgba('ink'));
    const cx = SCREEN.w / 2, cy = SCREEN.h * MARK.cy;
    const markPart = (part: 0 | 1, h: number, a: number) => {
      if (a <= 0) return;
      sc.globalAlpha = a;
      sc.fillStyle = rgba('signal');
      sc.beginPath();
      if (part === 0) KEY.one.forEach((q, i) => { const p = keyPt(q, cx, cy, h); if (i) sc.lineTo(p.x, p.y); else sc.moveTo(p.x, p.y); });
      else {
        const k = h / KEY.height, c = keyPt([KEY.ring.cx, KEY.ring.cy], cx, cy, h);
        sc.arc(c.x, c.y, KEY.ring.R * k, 0, TAU);
        sc.arc(c.x, c.y, KEY.ring.r * k, 0, TAU, true);
      }
      sc.fill('evenodd');
      sc.globalAlpha = 1;
    };
    const mark = (h = MARK.h * 0.72, a = 1) => { sc.globalAlpha = a; sc.fillStyle = rgba('signal'); sc.fill(keyMarkPath(cx, cy, h), 'evenodd'); sc.globalAlpha = 1; };

    if (this.open && t >= this.cut.open + 0.15 && t < this.cut.one) {
      // the code, tiny, row by row (tied to the sheet by hairlines)
      const k = prog(t, this.cut.open + 0.15, this.cut.open + 0.6);
      sc.font = font(F.mono(500), 17);
      CODE.forEach((row, i) => {
        sc.fillStyle = rgba(i === 0 ? 'signal' : 'bone', (i === 0 ? 1 : 0.6) * prog(k, i * 0.05, i * 0.05 + 0.4));
        sc.fillText(i === 0 ? '// open source' : row.slice(0, 44), 34, SCREEN.h * 0.2 + i * 44);
      });
      return 1;
    }
    if (t < this.cut.one) {
      // wakes on "home"
      const wake = prog(t, home.start - 0.02, home.start + 0.2, ease.outCubic);
      mark(lerp(MARK.h * 0.6, MARK.h * 0.72, wake), wake);
      // the tiles going back in light the glass a little
      return wake;
    }
    if (t < this.cut.hold) {
      // "1" lands on "One", "O" on "key"
      const land = (w: Word) => prog(t, w.start + 0.1, w.start + 0.16);
      markPart(0, MARK.h, land(one[0]!));
      markPart(1, MARK.h, land(one[1]!));
      return 1;
    }
    const hold = hw[0]!, sign = this.word(this.hold, 'sign'), go = hw[hw.length - 1]!;
    if (t < sign.start) {
      // hold to sign: a ring fills round the mark
      mark(MARK.h * 0.6);
      const k = prog(t, hold.start, sign.start, ease.inOutQuad);
      sc.strokeStyle = rgba('bone', 0.14);
      sc.lineWidth = 10;
      sc.beginPath(); sc.arc(cx, cy, 190, 0, TAU); sc.stroke();
      sc.strokeStyle = rgba('signal');
      sc.lineCap = 'round';
      if (k > 0) { sc.beginPath(); sc.arc(cx, cy, 190, -Math.PI / 2, -Math.PI / 2 + k * TAU); sc.stroke(); }
      sc.lineCap = 'butt';
      sc.font = font(F.mono(500), 30);
      sc.fillStyle = rgba('bone', 0.75);
      const s = 'Hold to sign';
      sc.fillText(s, cx - sc.measureText(s).width / 2, SCREEN.h * 0.84);
      return 1;
    }
    if (t < go.end + 0.3) {
      const k = prog(t, sign.start - 0.02, sign.start + 0.25, ease.outCubic);
      sc.strokeStyle = rgba('signal');
      sc.lineWidth = 22; sc.lineCap = 'round'; sc.lineJoin = 'round';
      // the check draws itself
      const a: [number, number] = [cx - 110, cy + 5], b: [number, number] = [cx - 30, cy + 80], c: [number, number] = [cx + 120, cy - 90];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const len = k * (l1 + l2);
      sc.beginPath(); sc.moveTo(...a);
      if (len < l1) sc.lineTo(a[0] + ((b[0] - a[0]) * len) / l1, a[1] + ((b[1] - a[1]) * len) / l1);
      else { sc.lineTo(...b); const r = (len - l1) / l2; sc.lineTo(b[0] + (c[0] - b[0]) * r, b[1] + (c[1] - b[1]) * r); }
      sc.stroke();
      sc.lineCap = 'butt'; sc.lineJoin = 'miter';
      sc.font = font(F.archivo(100, 800), 72);
      sc.fillStyle = rgba('bone', k);
      const s = 'Signed';
      sc.fillText(s, cx - sc.measureText(s).width / 2, SCREEN.h * 0.74);
      return 1;
    }
    mark(MARK.h * 0.72, 1);
    const out = this.n === 1 ? 1 - prog(t, go.end + 1.4, go.end + 2.1) : 1 - prog(t, go.end, this.ctx.end - 0.2);
    return out;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t, lk = this.look, n2 = this.n === 2;
    const pose = this.pose(t);
    const L = this.lines;
    L.begin(pose);
    const cb = this.back.ctx, cf = this.front.ctx;
    this.back.clear();
    this.front.clear();

    const kw = this.keep.words, home = kw[4]!;
    const ow = this.only.words, go1 = ow[ow.length - 1]!;
    const hw = this.hold.words, go = hw[hw.length - 1]!;
    // n=2: the studio lights go down into end's ink after "go"
    const dusk = n2 ? prog(t, go.end - 0.3, this.ctx.end - 0.25, ease.inOutCubic) : 0;
    let flash = 0;

    // ---- background: a pool of light behind the device
    const b = this.bg.ctx;
    const dc = projW(pose, pose.pos ?? [0, 0, 0]);
    if (n2) {
      this.bg.clear(rgba('ink'));
      const g = b.createRadialGradient(dc.x, dc.y, 0, dc.x, dc.y, H * 1.25);
      g.addColorStop(0, `rgba(246,247,244,${1 - dusk})`);
      g.addColorStop(0.55, `rgba(226,229,224,${1 - dusk})`);
      g.addColorStop(1, `rgba(196,200,195,${1 - dusk})`);
      b.fillStyle = g; b.fillRect(0, 0, W, H);
      if (dusk > 0) {
        const g2 = b.createRadialGradient(dc.x, dc.y, 0, dc.x, dc.y, H * 0.8);
        g2.addColorStop(0, `rgba(28,31,29,${dusk})`); g2.addColorStop(1, 'rgba(10,11,10,0)');
        b.fillStyle = g2; b.fillRect(0, 0, W, H);
      }
    } else {
      this.bg.clear(rgba('ink'));
      const g = b.createRadialGradient(dc.x, dc.y, 0, dc.x, dc.y, H * 0.85);
      g.addColorStop(0, lk.pool); g.addColorStop(1, 'rgba(10,11,10,0)');
      b.fillStyle = g; b.fillRect(0, 0, W, H);
    }
    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });

    // ---- the tunnel and the boundary
    this.tunnel(t, pose);

    // ---- shot content
    const shot = this.shotAt(t);
    if (t < this.cut.only + 0.9) flash = Math.max(flash, this.drawKeep(t, pose, cb, cf));
    if (t >= this.cut.only - 0.1 && t < this.cut.twenty + 1.2) this.drawOnly(t, pose, cf);
    if (t >= this.cut.twenty - 0.1 && t < this.cut.one + 1.0) this.drawGrid(t, pose, cf);
    if (this.open && t >= this.cut.open - 0.1 && t < this.cut.one + 0.9) this.drawOpen(t, pose, cf);
    if (t >= this.cut.one - 0.1 && t < this.cut.hold + 0.8) flash = Math.max(flash, this.drawOne(t, pose, cf));
    if (t >= this.cut.hold - 0.1) this.drawHold(t, pose, cb);
    // signatures leaving: on "signatures" and "go" of line 2, and on "go" of the last line
    const sigW = this.word(this.only, 'signatures');
    this.burst(t, pose, sigW.start, 14, 11);
    this.burst(t, pose, go1.start, 34, 23);
    this.burst(t, pose, go.start, 48, 37);
    void shot; void audio;

    // ---- composite: back type, back lines, the device, front lines, front type
    comp.draw(renderer, this.back.upload(), out);
    L.back.render(renderer, out, camera3(pose));
    const scr = this.drawScreen(t);
    pose.screen = scr;
    const lift = this.n === 1 ? prog(t, go.end + 1.9, this.ctx.end - 0.1, ease.inCubic) * 2.4 : 0;
    const dp: DevicePose = { ...pose, sweep: this.sweep(t), explode: lift > 0 ? 0.001 : 0, lift, gain: n2 ? lerp(1.1, 1, dusk) : 1 };
    comp.draw(renderer, this.dev.render(renderer, dp), out);
    L.front.render(renderer, out, camera3(pose));
    comp.draw(renderer, this.front.upload(), out);

    const bloom = n2 ? lerp(0.12, 0.45, dusk) : 0.45;
    return { bloom, vignette: n2 ? lerp(0.2, 0.45, dusk) : 0.42, halation: n2 ? 0 : 0.15, flash };
  }

  /** The light bar: across the glass on "home", "OneKey" and "sign". */
  sweep(t: number) {
    const at = [this.keep.words[4]!.start + 0.1, this.one.words[2]!.start, this.word(this.hold, 'sign').start];
    for (const a of at) if (t >= a - 0.1 && t < a + 1.0) return lerp(-1.6, 1.6, prog(t, a - 0.1, a + 1.0, ease.inOutCubic));
    return 9;
  }

  // ------------------------------------------------------------------ pieces
  /** The tunnel of outline rings; on "home" they all collapse onto the device's outline (the boundary). */
  tunnel(t: number, pose: DevicePose) {
    const L = this.lines, lk = this.look;
    const home = this.keep.words[4]!;
    const zc = pose.cam[2];
    const on = 1 - prog(t, this.cut.twenty, this.cut.twenty + 0.6);
    const col = lk.line;
    const P = this.ringPts;
    if (t < home.start + 0.6 && on > 0) {
      const rails = 1 - prog(t, home.start - 0.05, home.start + 0.25);
      const nR = Math.round((RING.z1 - RING.z0) / RING.step);
      let prev: V3[] | null = null, prevA = 0;
      for (let j = 0; j <= nR; j++) {
        const z0 = RING.z0 + j * RING.step;
        const c = prog(t, home.start - 0.06 + Math.abs(z0) * 0.004, home.start + 0.22 + Math.abs(z0) * 0.004, ease.inOutCubic);
        const s = lerp(RING.s, 1.035, c), z = lerp(z0, 0, c);
        const d = zc - z;
        const fog = prog(d, 44, 10) * prog(d, 0.6, 3.5);
        const a = fog * lerp(0.42, 0.1, c) * (lk.dark ? 1 : 0.8);
        const pts = P.map(([x, y]): V3 => [x * s, y * s, z]);
        if (a > 0.004) L.poly(pts, 1.1, col, a, true, z < 0 ? 'back' : 'front');
        // rails between rings, every 8th outline point
        if (prev && rails > 0) for (let i = 0; i < P.length; i += 8) L.seg(prev[i]!, pts[i]!, 1, col, Math.min(a, prevA) * 0.6 * rails, z < 0 ? 'back' : 'front');
        prev = pts; prevA = a;
      }
      // dust: short streaks along the tunnel, longer the faster we fly
      const v = Math.max(0, (this.zc(t - 0.03) - this.zc(t)) / 0.03);
      const len = Math.min(3.2, v * 0.05);
      for (let i = 0; i < 260; i++) {
        const r = 1.2 + hash(i, 3) * 5, a = hash(i, 4) * TAU;
        const z = RING.z0 + hash(i, 5) * (RING.z1 - RING.z0);
        const d = zc - z;
        const al = prog(d, 30, 6) * prog(d, 0.3, 2) * 0.5 * rails;
        if (al <= 0.01) continue;
        const x = Math.cos(a) * r, y = Math.sin(a) * r * 1.3;
        L.seg([x, y, z], [x, y, z + len + 0.05], 0.9, col, al);
      }
    }
    // the boundary: the device's outline, drawn tight round it from "home" until the grid comes
    const bnd = prog(t, home.start + 0.1, home.start + 0.3) * on;
    if (bnd > 0) {
      const flashK = Math.pow(0.5, Math.max(0, t - home.start - 0.2) / 0.25);
      const pts = P.map(([x, y]) => this.dev.toWorld(pose, [x * 1.035, y * 1.035 + (y > 0 ? 0.001 : -0.001), 0]));
      L.poly(pts, 1.3, lk.dark ? lk.hot : col, bnd * (0.35 + 0.65 * flashK), true, 'front');
    }
  }

  /** KEEP / YOUR / KEYS / AT: slabs standing in the tunnel; HOME behind the device. Returns a flash. */
  drawKeep(t: number, pose: DevicePose, cb: CanvasRenderingContext2D, cf: CanvasRenderingContext2D): number {
    const lk = this.look;
    const w = this.keep.words, home = w[4]!;
    const fam = F.archivo(100, 900);
    const face = lk.fg(), side = lk.dark ? 'rgba(46,50,47,1)' : rgba('ash');
    // where each word stands: in a quadrant round the flight path (so it sweeps out of frame as the camera
    // passes, never across it), ~5 units ahead of the camera when it's sung. [side, baseline y, em, ahead]
    const place: [number, number, number, number][] = [
      [-1, 0.3, 0.7, 6.2],
      [1, -0.8, 0.7, 6.0],
      [1, 0.3, 0.7, 5.8],
      [-1, -0.75, 0.66, 4.6],
    ];
    const fade = 1 - prog(t, this.cut.only + 0.2, this.cut.only + 0.8);
    for (let i = 0; i < 4; i++) {
      const wd = w[i]!;
      const k = prog(t, wd.start - 0.03, wd.start + 0.16, ease.outExpo);
      if (k <= 0) continue;
      const [sd, y, size, ahead] = place[i]!;
      const label = wd.w.replace(/[^A-Za-z]/g, '').toUpperCase();
      const z = this.zc(wd.start) - ahead;
      const tw = width3D(label, fam, size);
      const pl = plane([sd < 0 ? -0.32 - tw : 0.32, y, z], 0);
      // gone before the camera is close enough for a letter to fill the frame
      const near = prog(pose.cam[2] - z, 1.1, 2.3);
      cf.globalAlpha = clamp(k * 2.5) * fade * near;
      slab3D(cf, pose, label, fam, size, pl, 0, { depth: 0.2, face, side, lift: -(1 - k) * 2.2 });
    }
    cf.globalAlpha = 1;
    // HOME: on a plane behind the device, the device lands in front of it
    const kh = prog(t, home.start - 0.03, home.start + 0.2, ease.outExpo);
    if (kh > 0) {
      // "HO" and "ME" either side of the device: it lands in the gap
      const size = 1.55, gap = 0.98;
      const back = prog(t, this.cut.only, this.cut.twenty, ease.inOutCubic);
      const z = -2.6 - back * 2.5;
      cb.globalAlpha = clamp(kh * 2.5) * lerp(1, lk.dark ? 0.14 : 0.2, prog(t, home.end - 0.1, home.end + 0.45, ease.inOutQuad)) * (1 - prog(t, this.cut.twenty - 0.2, this.cut.twenty + 0.5));
      const ho = width3D('HO', fam, size);
      slab3D(cb, pose, 'HO', fam, size, plane([-gap - ho, -0.55, z], 0), 0, { depth: 0.3, face, side, lift: (1 - kh) * 1.5 });
      slab3D(cb, pose, 'ME', fam, size, plane([gap, -0.55, z], 0), 0, { depth: 0.3, face, side, lift: (1 - kh) * 1.5 });
      cb.globalAlpha = 1;
    }
    return lk.dark ? 0.05 * (t >= home.start ? Math.pow(0.5, (t - home.start) / 0.04) : 0) : 0;
  }

  /** "Only", and "the signatures go" written in light by a pen whose line comes out of the screen. */
  drawOnly(t: number, pose: DevicePose, cf: CanvasRenderingContext2D) {
    const lk = this.look, L = this.lines;
    const w = this.only.words, go = w[w.length - 1]!;
    const fade = 1 - prog(t, this.cut.twenty - 0.15, this.cut.twenty + 0.25);
    if (fade <= 0) return;
    const yaw = 0.34;
    const o: V3 = [0.72, 0.52, 0.25];
    // "Only": Archivo, sung
    cf.globalAlpha = fade;
    lyric3D(cf, pose, this.only, t, plane(o, yaw), { family: F.archivo(100, 900), size: 0.4, on: lk.fg(), off: lk.fg(0.18), only: [0] });
    cf.globalAlpha = 1;
    // the signature, below; it peels off towards the camera on "go"
    const away = prog(t, go.start + 0.05, go.start + 0.75, ease.inCubic);
    const len = writtenLength(this.sig, this.sigTimes, t);
    if (len <= 0) return;
    const scale = 2.5 / this.sig.width;
    const col = lk.hot;
    const trail = [0, 0.05, 0.1, 0.16, 0.22];
    let head: V3 | null = null;
    for (const [i, dt] of trail.entries()) {
      if (i > 0 && away <= 0) break;
      const a = Math.max(0, away - dt * away * 1.5);
      const off: V3 = [a * 2.6, a * 0.5, a * 4.4];
      const pl = plane([o[0] + off[0], o[1] - 0.52 + off[1], o[2] + off[2]], yaw);
      const h = stroke3D(L.front, this.sig, len, pl, scale, lk.dark ? 2.2 : 2.4, col, (i === 0 ? 1 : 0.35 / i) * fade);
      if (i === 0) head = h;
    }
    // the pen and its line back into the screen
    if (head && away < 0.4 && len < this.sig.total - 0.5) {
      const s0 = this.dev.toWorld(pose, [0.12, 0.05, DEVICE.t / 2]);
      const mid: V3 = [(s0[0] + head[0]) / 2, (s0[1] + head[1]) / 2 - 0.25, (s0[2] + head[2]) / 2 + 0.6];
      for (let i = 0; i < 16; i++) {
        const u0 = i / 16, u1 = (i + 1) / 16;
        L.seg(bez(s0, mid, head, u0), bez(s0, mid, head, u1), 1.1, lk.line, (0.15 + 0.55 * u1) * fade);
      }
      L.seg(head, [head[0] + 0.001, head[1], head[2]], 7, col, 0.5 * fade, 'front');
      L.seg(head, [head[0] + 0.001, head[1], head[2]], 3, lk.dark ? [4, 4.4, 4.1] : col, fade, 'front');
    } else if (head && len >= this.sig.total - 0.5 && away <= 0) {
      L.seg(head, [head[0] + 0.001, head[1], head[2]], 5, col, 0.6 * fade, 'front');
    }
  }

  /** A burst of signatures leaving the screen and flying past the camera. */
  burst(t: number, pose: DevicePose, t0: number, count: number, seed: number) {
    if (t < t0 || t > t0 + 1.6) return;
    const lk = this.look, L = this.lines;
    const { rt, up, fw } = basis(pose);
    for (let i = 0; i < count; i++) {
      const dur = 0.55 + hash(i, seed) * 0.6;
      const delay = hash(i, seed + 1) * 0.18;
      const k = (t - t0 - delay) / dur;
      if (k <= 0 || k > 1.6) continue;
      // from a point on the outline (the boundary), radially out and past the camera
      const R = this.ringPts, h = hash(i, seed + 2) * R.length, j = Math.floor(h);
      const A = R[j]!, B = R[(j + 1) % R.length]!, f = h - j;
      const P: V3 = [lerp(A[0], B[0], f), lerp(A[1], B[1], f), 0];
      const dp = pose.pos ?? [0, 0, 0], ds = pose.scale ?? 1;
      const a: V3 = [dp[0] + (rt[0] * P[0] + up[0] * P[1]) * 1.04 * ds, dp[1] + (rt[1] * P[0] + up[1] * P[1]) * 1.04 * ds, dp[2] + (rt[2] * P[0] + up[2] * P[1]) * 1.04 * ds];
      const ang = Math.atan2(P[1], P[0]) + (hash(i, seed + 4) - 0.5) * 0.5, rad = 1.0 + hash(i, seed + 5) * 2.4;
      const dir: V3 = [rt[0] * Math.cos(ang) + up[0] * Math.sin(ang), rt[1] * Math.cos(ang) + up[1] * Math.sin(ang), rt[2] * Math.cos(ang) + up[2] * Math.sin(ang)];
      const e: V3 = [pose.cam[0] + dir[0] * rad - fw[0] * 0.5, pose.cam[1] + dir[1] * rad - fw[1] * 0.5, pose.cam[2] + dir[2] * rad - fw[2] * 0.5];
      const out = 0.6 + hash(i, seed + 6) * 0.8;
      const m: V3 = [a[0] + dir[0] * out + (e[0] - a[0]) * 0.25, a[1] + dir[1] * out + (e[1] - a[1]) * 0.25, a[2] + dir[2] * out + (e[2] - a[2]) * 0.25];
      fiber(L, a, m, e, ease.inQuad(clamp(k)), 0.35, lk.dark ? 1.4 : 1.2, lk.hot, lk.dark ? 0.8 : 0.7, 20);
    }
  }

  /** The 24 cells. */
  drawGrid(t: number, pose: DevicePose, cf: CanvasRenderingContext2D) {
    const lk = this.look, L = this.lines;
    const line = this.twenty, w = line.words;
    const never = this.word(line, 'never'), know = this.word(line, 'know');
    const { cols, rows } = GRID;
    const gw = cols * GRID.w + (cols - 1) * GRID.gx, gh = rows * GRID.h + (rows - 1) * GRID.gy;
    // which cell each sung word fills: spread in time across the 24
    const span = know.start - w[0]!.start;
    const cellOf = new Map<number, Word>();
    for (const wd of w) cellOf.set(Math.round(((wd.start - w[0]!.start) / span) * 23), wd);
    const lastOut = [...cellOf.entries()].filter(([, wd]) => wd === never || wd === know).map(([i]) => i);
    const screenC = this.dev.toWorld(pose, [0, 0.05, DEVICE.t / 2]);
    type T = { i: number; P: V3; ux: V3; uy: V3; nrm: V3; s: number; depth: number; front: boolean; a: number };
    const tiles: T[] = [];
    for (let i = 0; i < 24; i++) {
      const cx = -gw / 2 + GRID.w / 2 + (i % cols) * (GRID.w + GRID.gx);
      const cy = gh / 2 - GRID.h / 2 - Math.floor(i / cols) * (GRID.h + GRID.gy);
      const slot: V3 = [cx, cy, GRID.z];
      // out of the screen, one per 1/32 of a second
      const tb = this.cut.twenty + 0.05 + i * 0.032;
      const kin = prog(t, tb, tb + 0.42, ease.outCubic);
      if (kin <= 0) continue;
      // back in: flip, then fall into the screen
      const li = lastOut.indexOf(i);
      const tf = li >= 0 ? know.start + 0.35 + li * 0.14 : never.start + 0.02 * i;
      const flip = prog(t, tf, tf + 0.32, ease.inOutCubic);
      const fall = prog(t, tf + 0.22, tf + 0.62, ease.inCubic);
      if (fall >= 1) continue;
      const P0: V3 = [lerp(screenC[0], slot[0], kin), lerp(screenC[1], slot[1], kin), lerp(screenC[2], slot[2], kin) + Math.sin(kin * Math.PI) * 0.25];
      const P: V3 = [lerp(P0[0], screenC[0], fall), lerp(P0[1], screenC[1], fall), lerp(P0[2], screenC[2], fall)];
      const th = flip * Math.PI + (1 - kin) * 0.6;
      const ux: V3 = [1, 0, 0], uy: V3 = [0, Math.cos(th), Math.sin(th)];
      const nrm = cross(ux, uy);
      const s = lerp(0.15, 1, kin) * lerp(1, 0.05, fall);
      const toCam = [pose.cam[0] - P[0], pose.cam[1] - P[1], pose.cam[2] - P[2]];
      const front = nrm[0] * toCam[0]! + nrm[1] * toCam[1]! + nrm[2] * toCam[2]! > 0;
      tiles.push({ i, P, ux, uy, nrm, s, depth: L.depth(P), front, a: clamp(kin * 3) });
      // corner trails while flying
      if (kin < 1 || fall > 0) {
        const tr = kin < 1 ? 1 - kin : fall;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const q: V3 = [P[0] + (sx * GRID.w * s) / 2, P[1] + (sy * GRID.h * s * Math.cos(th)) / 2, P[2] + (sy * GRID.h * s * Math.sin(th)) / 2];
          const back: V3 = [lerp(q[0], screenC[0], 0.35 * tr), lerp(q[1], screenC[1], 0.35 * tr), lerp(q[2], screenC[2], 0.35 * tr)];
          L.seg(back, q, 1, lk.line, 0.5 * Math.sin(Math.PI * clamp(tr)), 'front');
        }
      }
    }
    tiles.sort((a, b) => b.depth - a.depth);
    const fam = F.archivo(100, 800), mono = F.mono(500);
    for (const tl of tiles) {
      const { P, ux, uy, s } = tl;
      const hw = (GRID.w * s) / 2, hh = (GRID.h * s) / 2, r = GRID.r * s;
      const at = (x: number, y: number, z = 0): V3 => [P[0] + ux[0] * x + uy[0] * y + tl.nrm[0] * z, P[1] + ux[1] * x + uy[1] * y + tl.nrm[1] * z, P[2] + ux[2] * x + uy[2] * y + tl.nrm[2] * z];
      // rounded rect outline, projected
      const path = new Path2D();
      const pts: [number, number][] = [];
      const corner = (cx: number, cy: number, a0: number) => { for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
      corner(hw - r, hh - r, 0); corner(-hw + r, hh - r, Math.PI / 2); corner(-hw + r, -hh + r, Math.PI); corner(hw - r, -hh + r, Math.PI * 1.5);
      let ok = true;
      pts.forEach(([x, y], k) => { const q = projW(pose, at(x, y)); if (q.z < 0.05) ok = false; if (k) path.lineTo(q.x, q.y); else path.moveTo(q.x, q.y); });
      if (!ok) continue;
      path.closePath();
      const wd = tl.front ? cellOf.get(tl.i) : undefined;
      const sung = wd ? Lyrics.wordProgress(wd, t) > 0 : false;
      cf.globalAlpha = tl.a;
      cf.fillStyle = lk.dark ? (tl.front ? 'rgb(19,22,20)' : 'rgb(12,13,12)') : (tl.front ? 'rgb(250,251,249)' : 'rgb(214,217,212)');
      cf.fill(path);
      cf.strokeStyle = sung ? lk.fg(0.95) : lk.fg(tl.front ? 0.34 : 0.18);
      cf.lineWidth = sung ? 1.6 : 1.1;
      cf.stroke(path);
      if (tl.front && s > 0.6) {
        const pl: Plane = { o: at(0, 0, 0.001), u: ux, v: uy };
        // index, vertically centred on the tile's mid-line (Plex digits: cap ~0.7 em)
        const ms = 0.042 * s;
        cf.fillStyle = lk.fg(0.42);
        text3D(cf, pose, String(tl.i + 1).padStart(2, '0'), mono, ms, { o: onPlane(pl, 0, -ms * 0.35), u: ux, v: uy }, -hw + 0.04 * s, 0);
        const x0 = -hw + 0.12 * s, avail = hw * 2 - 0.16 * s;
        if (wd && sung) {
          const label = wd.w.replace(/[^A-Za-z-]/g, '');
          const size = Math.min(0.125, avail / width3D(label, fam, 1)) * s;
          const k = prog(t, wd.start - 0.02, wd.start + 0.14, ease.outExpo);
          cf.globalAlpha = tl.a * clamp(k * 3);
          cf.fillStyle = lk.fg();
          text3D(cf, pose, label, fam, size, { o: onPlane(pl, 0, -size * 0.36), u: ux, v: uy }, x0, (1 - k) * 0.05);
        } else {
          // masked: a bar, never a word
          const bw = avail * (0.55 + 0.4 * hash(tl.i, 9)), bh = 0.05 * s;
          const q = [at(x0, -bh / 2, 0.001), at(x0 + bw, -bh / 2, 0.001), at(x0 + bw, bh / 2, 0.001), at(x0, bh / 2, 0.001)].map((v) => projW(pose, v));
          cf.fillStyle = lk.fg(0.2);
          cf.beginPath(); q.forEach((p, k) => (k ? cf.lineTo(p.x, p.y) : cf.moveTo(p.x, p.y))); cf.closePath(); cf.fill();
        }
      }
      cf.globalAlpha = 1;
    }
  }

  /** n=2: the firmware on a sheet in space, tied to the screen line by line; the lyric is its first line. */
  drawOpen(t: number, pose: DevicePose, cf: CanvasRenderingContext2D) {
    const lk = this.look, L = this.lines, line = this.open!;
    const w = line.words;
    const kin = prog(t, this.cut.open, this.cut.open + 0.9, ease.outCubic);
    const kout = 1 - prog(t, this.cut.one + 0.1, this.cut.one + 0.7, ease.inCubic);
    if (kin <= 0 || kout <= 0) return;
    const mono = F.mono(500);
    const size = 0.092, lead = 0.155;
    const scroll = prog(t, this.cut.open, this.cut.one + 0.6) * lead;
    const o: V3 = [0.62, 0.8 + scroll, -0.2];
    const pl = plane(o, -0.2);
    const typed = line.words.map((x) => x.w).join(' ');
    let shown = '';
    for (const wd of w) if (t >= wd.start) shown += (shown ? ' ' : '') + wd.w.slice(0, Math.max(1, Math.round(wd.w.length * prog(t, wd.start, Math.min(wd.end, wd.start + 0.3)))));
    void typed;
    CODE.forEach((s, i) => {
      const ki = prog(kin, i * 0.04, i * 0.04 + 0.5);
      if (ki <= 0) return;
      const y = -i * lead;
      const rowPl: Plane = { o: onPlane(pl, 0, y, (1 - ki) * 0.8), u: pl.u, v: pl.v };
      const text = i === 0 ? '// ' + shown.toLowerCase() : s;
      if (!text.trim()) return;
      cf.globalAlpha = ki * kout;
      if (i === 0) {
        cf.fillStyle = lk.fg();
        text3D(cf, pose, text, F.mono(700), size * 1.3, { o: onPlane(rowPl, 0, size * 0.4), u: pl.u, v: pl.v }, 0, 0);
      } else {
        cf.fillStyle = lk.fg(0.55);
        text3D(cf, pose, text, mono, size, rowPl, 0, 0);
      }
      // the hairline back to its row on the screen
      const sy = SCREEN.h * 0.2 + i * 44 - 7;
      const a = this.dev.toWorld(pose, screenPt(SCREEN.w * 0.86, sy));
      const bpt = onPlane(pl, -0.08, y + size * 0.3);
      const m: V3 = [(a[0] + bpt[0]) / 2, (a[1] + bpt[1]) / 2, (a[2] + bpt[2]) / 2 + 0.35];
      const steps = 12;
      for (let k = 0; k < steps; k++) L.seg(bez(a, m, bpt, k / steps), bez(a, m, bpt, (k + 1) / steps), 1, lk.line, (i === 0 ? 0.8 : 0.35) * ki * kout);
    });
    cf.globalAlpha = 1;
    // the same code, tiny, on the screen
    const sc = this.dev.screen.ctx;
    void sc;
  }

  /** "One key (OneKey), all yours": the wire "1" and "O" fall onto the glass; the name beside. */
  drawOne(t: number, pose: DevicePose, cf: CanvasRenderingContext2D): number {
    const lk = this.look, L = this.lines;
    const w = this.one.words;
    let flash = 0;
    const cy = (SCREEN.h / 2 - SCREEN.h * MARK.cy) * PXU;
    const hDu = MARK.h * PXU;
    // the screen plane in the world
    const o = this.dev.toWorld(pose, [0, 0, DEVICE.t / 2]);
    const ex = this.dev.toWorld(pose, [1, 0, DEVICE.t / 2]), ey = this.dev.toWorld(pose, [0, 1, DEVICE.t / 2]);
    const pl: Plane = { o, u: norm([ex[0] - o[0], ex[1] - o[1], ex[2] - o[2]]), v: norm([ey[0] - o[0], ey[1] - o[1], ey[2] - o[2]]) };
    for (const part of [0, 1] as const) {
      const wd = w[part]!;
      const k = prog(t, wd.start - 0.3, wd.start + 0.12, ease.inCubic);
      if (k <= 0) continue;
      const gone = prog(t, wd.start + 0.12, wd.start + 0.4);
      if (gone < 1) {
        const lift = lerp(1.9, 0.004, k);
        const lp: Plane = { o: onPlane(pl, 0, 0, lift), u: pl.u, v: pl.v };
        wireMark(L, part, hDu * lerp(1.25, 1, k), lp, 0, cy, lerp(0.12, 0.02, k), lk.dark ? 1.6 : 1.3, lk.hot, (1 - gone) * clamp(k * 4), 'front');
      }
      // landing: a ripple across the glass, out to the outline
      const r = prog(t, wd.start + 0.12, wd.start + 0.75, ease.outCubic);
      if (r > 0 && r < 1) {
        const P = this.ringPts.map(([x, y]): V3 => {
          const s = lerp(0.3, 1.0, r);
          return onPlane(pl, x * s, (y - cy) * s + cy, 0.002);
        });
        L.poly(P, 1.2, lk.hot, (1 - r) * 0.8, true, 'front');
      }
      if (t >= wd.start + 0.12) flash = Math.max(flash, (lk.dark ? 0.035 : 0) * Math.pow(0.5, (t - wd.start - 0.12) / 0.04));
    }
    // the name, standing beside the device; "all yours" under it
    const ok = w[2]!;
    const kn = prog(t, ok.start - 0.02, ok.start + 0.25, ease.outExpo);
    const out = 1 - prog(t, this.cut.hold + 0.1, this.cut.hold + 0.6);
    if (kn > 0 && out > 0) {
      const yaw = 0.3;
      const npl = plane([0.78, 0.12, 0.15], yaw);
      cf.globalAlpha = clamp(kn * 2.5) * out;
      slab3D(cf, pose, 'OneKey', F.archivo(100, 900), 0.52, npl, 0, { depth: 0.08, face: lk.fg(), side: lk.dark ? 'rgba(46,50,47,1)' : rgba('ash'), lift: (1 - kn) * 0.6 });
      cf.globalAlpha = out;
      // "all yours" is the line's second row (the first, "One key (OneKey),", is hidden: it's the mark and the name)
      lyric3D(cf, pose, this.one, t, plane([0.8, -0.28 + 0.3, 0.15], yaw), { family: F.archivo(100, 800), size: 0.2, on: lk.fg(), off: lk.fg(0.18), only: [3, 4], rows: [3], leading: 0.3 });
      cf.globalAlpha = 1;
    }
    return flash;
  }

  /** HOLD IT / SIGN IT / GO on a plane behind the device. */
  drawHold(t: number, pose: DevicePose, cb: CanvasRenderingContext2D) {
    const lk = this.look;
    const hw = this.hold.words;
    const hold = hw[0]!, sign = this.word(this.hold, 'sign'), go = hw[hw.length - 1]!;
    const fam = F.archivo(100, 900);
    const face = lk.fg(), side = lk.dark ? 'rgba(46,50,47,1)' : rgba('ash');
    const labels: [Word, string, number][] = [[hold, 'HOLD IT', 1.25], [sign, 'SIGN IT', 1.25], [go, 'GO', 1.9]];
    const endOut = this.n === 1 ? 1 - prog(t, go.end + 0.6, go.end + 1.6) : 1 - prog(t, go.end - 0.2, go.end + 0.5);
    labels.forEach(([wd, label, size], i) => {
      const next = labels[i + 1]?.[0];
      const k = prog(t, wd.start - 0.03, wd.start + 0.18, ease.outExpo);
      if (k <= 0) return;
      const recede = next ? prog(t, next.start - 0.06, next.start + 0.12, ease.outCubic) : 0;
      if (recede >= 1) return;
      const tw = width3D(label, fam, size);
      const z = -2.4 + (1 - k) * 1.4 - recede * 3;
      const pl = plane([-tw / 2, -0.45 + (i === 2 ? -0.2 : 0), z], 0);
      cb.globalAlpha = clamp(k * 2.5) * Math.pow(1 - recede, 2) * endOut;
      slab3D(cb, pose, label, fam, size, pl, 0, { depth: 0.3, face, side });
    });
    cb.globalAlpha = 1;
  }
}
