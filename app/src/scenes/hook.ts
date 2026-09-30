// `hook` ×2 (the choruses) — docs/TREATMENT.md. One module, two entries: params.n = 1 | 2.
//   "Keep your keys at home": full-frame Archivo 900, one word per hit; HOME becomes the device outline.
//   "Only the signatures go": the key bounces inside the outline; each signature (a hairline) shoots
//     out of it and off frame. Green never leaves; white (here: the foreground colour) does.
//   "Twenty-four words the internet will never know": 24 masked cells light one per sixteenth; on
//     "never" the grid flips over, blank.
//   n=2 only, "Open source, read every line": illustrative firmware-style code (our own, not copied)
//     scrolls up; the sung line is highlighted.
//   "One key (OneKey), all yours": the "1" slams on "One", the "O" on "key", the mark is whole.
//   "Hold it, sign it, go": HOLD / SIGN / GO; then the mark holds for the next plate.
// n=1: bone on ink. n=2: ink on OneKey green, heavier.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, fitSize, font } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, lerp, prog, springStep, TAU } from '../engine/util';
import { KEY, devicePath, keyHead2D, keyMarkPath, keyPt, lyricLine } from './_motifs';
import { Device3D, SCREEN, orbit, type DevicePose } from './_device3d';

const CODE = [
  'fn sign(tx: &Transaction) -> Result<Signature> {',
  '    let key = secure_element::slot(0)?;',
  '    ui::show_plain(tx)?;           // what you sign is what you see',
  '    if !ui::confirm()? { return Err(Rejected) }',
  '    let sig = key.sign(tx.digest())?;',
  '    // the key never leaves the chip',
  '    Ok(sig)',
  '}',
  '',
  'fn export_key() -> ! {',
  '    unreachable!("keys stay home")',
  '}',
];

export default class Hook extends Scene {
  text = new Layer2D();
  front = new Layer2D();
  dev = new Device3D();
  n = 1;
  keep!: Line; only!: Line; twenty!: Line; one!: Line; hold!: Line; open: Line | null = null;

  override init() {
    const ly = this.ctx.lyrics;
    this.n = this.ctx.params.n ?? 1;
    const k = this.n - 1;
    this.keep = ly.get('Keep your keys at home', k);
    this.only = ly.get('Only the signatures go', k);
    this.twenty = ly.get('Twenty-four words', k);
    this.one = ly.get('One key', k);
    this.hold = ly.get('Hold it, sign it', k);
    if (this.n === 2) this.open = ly.get('Open source');
  }

  cutAt(l: Line) {
    const au = this.ctx.audio;
    return au.timeOfBeat(Math.floor(au.beatAt(l.words[0]!.start + 0.02)));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t, n2 = this.n === 2;
    const BG = n2 ? rgba('signal') : rgba('ink');
    const FG = (a = 1) => (n2 ? rgba('ink', a) : rgba('bone', a));
    const c = this.text.ctx;
    this.text.clear(BG);

    const segs: [Line, string][] = [[this.keep, 'keep'], [this.only, 'only'], [this.twenty, 'twenty']];
    if (this.open) segs.push([this.open, 'open']);
    segs.push([this.one, 'one'], [this.hold, 'hold']);
    let seg = segs[0]!;
    // cut on the beat before each line, except into 'only': HOME needs its whole word to become the outline
    for (const s of segs) if (t >= (s[1] === 'only' ? s[0].words[0]!.start - 0.05 : this.cutAt(s[0])) - 1e-6) seg = s;
    const [line, kind] = seg;
    let flash = 0;
    let devPose: DevicePose | null = null, devOpacity = 1, screen: 'mark' | 'signed' = 'mark';
    let caption: Line | null = null;

    /** A word slammed full frame: scales down onto the frame on its start. */
    const slam = (w: Word, label: string, y = H * 0.5) => {
      const fam = F.archivo(n2 ? 112 : 100, 900);
      const size = Math.min(n2 ? 520 : 460, fitSize(label, fam, W - 200, 600));
      const k = prog(t, w.start - 0.02, w.start + 0.14, ease.outExpo);
      const s = lerp(1.35, 1, k);
      c.save();
      c.translate(W / 2, y);
      c.scale(s, s);
      c.font = font(fam, size);
      const tw = c.measureText(label).width;
      c.fillStyle = FG(clamp(k * 3));
      c.fillText(label, -tw / 2, size * 0.36);
      c.restore();
      flash = Math.max(flash, (n2 ? 0 : 0.05) * Math.pow(0.5, Math.max(0, t - w.start) / 0.03) * (t >= w.start ? 1 : 0));
    };
    const current = (l: Line) => {
      let cur: Word | null = null;
      for (const w of l.words) if (t >= w.start - 0.02) cur = w;
      return cur;
    };
    const DX = W / 2, DY = H * 0.44, DWD = 300;
    const keyDot = (x: number, y: number, s = 1) => {
      if (n2) { c.fillStyle = rgba('ink'); c.beginPath(); c.arc(x, y, 9 * s, 0, TAU); c.fill(); }
      else keyHead2D(c, x, y, s, 0.85 + 0.15 * f.a.kick);
    };

    if (kind === 'keep') {
      const w = current(line);
      const home = line.words[line.words.length - 1]!;
      if (!w) keyDot(W / 2, H / 2, 0.8); // before the first hit: only the key, carried over from the last plate
      if (w && w !== home) slam(w, w.w.replace(/[^A-Za-z]/g, '').toUpperCase());
      if (w === home) {
        // HOME slams, then the outline of the device draws round it and it shrinks inside
        const k = prog(t, home.start + 0.15, home.start + 0.5, ease.inOutCubic);
        if (k < 1) {
          c.save(); c.globalAlpha = 1 - k; slam(home, 'HOME'); c.restore();
        }
        const p = devicePath(DX, DY, lerp(W * 0.9, DWD, ease.outCubic(prog(t, home.start, home.start + 0.35))));
        c.strokeStyle = FG(0.95);
        c.lineWidth = 2;
        c.stroke(p);
        if (k > 0) {
          c.font = font(F.mono(500), 26);
          c.fillStyle = FG(0.9 * k);
          c.fillText('home', DX - 30, DY + DWD * 0.95);
          keyDot(DX, DY, 0.9 * k);
        }
      }
    } else if (kind === 'only') {
      // the key bounces inside the outline; signatures leave
      const p = devicePath(DX, DY, DWD);
      c.strokeStyle = FG(0.95);
      c.lineWidth = 2;
      c.stroke(p);
      const ix = DWD * 0.38, iy = DWD * 1.6 * 0.42;
      const tri = (x: number) => 1 - 2 * Math.abs(((x % 2) + 2) % 2 - 1);
      const kx = DX + ix * tri((t - this.ctx.start) * 1.3 + 0.3), ky = DY + iy * tri((t - this.ctx.start) * 0.9 + 0.7);
      keyDot(kx, ky, 1);
      const sig = line.words.find((w) => w.w.startsWith('signatures'))!;
      const go = line.words[line.words.length - 1]!;
      for (const [i, t0] of [sig.start, sig.start + 0.35, go.start].entries()) {
        const k = prog(t, t0, t0 + 0.5, ease.inCubic);
        if (k <= 0) continue;
        const ang = [-0.35, 0.25, -0.05][i]!;
        const L = lerp(0, 1400, k), sx = DX + Math.cos(ang) * 40, sy = DY + Math.sin(ang) * 40;
        const ex = sx + Math.cos(ang) * L, ey = sy + Math.sin(ang) * L;
        c.strokeStyle = FG(0.9 * (1 - prog(t, t0 + 0.6, t0 + 1.2)));
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(sx, sy);
        // a signature squiggle, then straight out of the frame
        for (let u = 0; u <= 1; u += 0.02) {
          const x = lerp(sx, ex, u), y = lerp(sy, ey, u) + Math.sin(u * 40) * 8 * (1 - u);
          c.lineTo(x, y);
        }
        c.stroke();
      }
      lyricLine(c, line, t, 120, H - 90, { family: F.archivo(100, 800), size: 72, on: FG(), off: FG(0.3) });
    } else if (kind === 'twenty') {
      // 24 masked cells: 6 x 4
      const cols = 6, rows = 4, cw = 230, ch = 96, gx = 26, gy = 26;
      const gw = cols * cw + (cols - 1) * gx, gh = rows * ch + (rows - 1) * gy;
      const x0 = (W - gw) / 2, y0 = H * 0.5 - gh / 2;
      const b0 = audio.beatAt(line.words[0]!.start);
      const never = line.words.find((w) => w.w.startsWith('never'))!;
      // the sung words are written into the cells that light as they are sung; the rest stay masked
      const inCell = new Map<number, Word>();
      for (const w of line.words) {
        let i = Math.max(0, Math.min(23, Math.floor((audio.beatAt(w.start) - b0) * 4 + 1e-3)));
        while (inCell.has(i) && i < 23) i++;
        inCell.set(i, w);
      }
      for (let i = 0; i < 24; i++) {
        const cx = x0 + (i % cols) * (cw + gx), cy = y0 + Math.floor(i / cols) * (ch + gy);
        const on = f.beat >= b0 + i * 0.25;
        const fl = prog(t, never.start + i * 0.012, never.start + i * 0.012 + 0.3, ease.inOutCubic);
        const sy = Math.abs(Math.cos(fl * Math.PI));
        const back = fl > 0.5;
        c.save();
        c.translate(cx + cw / 2, cy + ch / 2);
        c.scale(1, Math.max(0.02, sy));
        c.strokeStyle = FG(0.6);
        c.lineWidth = 1.5;
        c.strokeRect(-cw / 2, -ch / 2, cw, ch);
        if (!back) {
          c.font = font(F.mono(400), 20);
          c.fillStyle = FG(0.6);
          c.fillText(String(i + 1).padStart(2, '0'), -cw / 2 + 14, -ch / 2 + 28);
          const w = inCell.get(i);
          if (w && t >= w.start - 0.02) {
            // a sung word, in the cell (the lyric itself, never a recovery word)
            const label = w.w.replace(/[^A-Za-z-]/g, '');
            const fam = F.archivo(100, 800);
            const sz = Math.min(50, fitSize(label, fam, cw - 70, 50));
            const k = prog(t, w.start - 0.02, w.start + 0.12, ease.outExpo);
            c.font = font(fam, sz);
            c.fillStyle = n2 ? rgba('ink') : rgba('signal');
            c.globalAlpha = clamp(k * 3);
            c.fillText(label, -cw / 2 + 58, sz * 0.36 + (1 - k) * 12);
            c.globalAlpha = 1;
          } else if (on) {
            c.fillStyle = FG(0.92);
            c.fillRect(-cw / 2 + 58, -14, cw - 80, 28); // a masked word: never a real one
          }
        }
        c.restore();
      }
    } else if (kind === 'open') {
      // illustrative code scrolling up; the sung line highlighted
      const words = line.words;
      let sung = 0;
      for (const w of words) if (Lyrics.wordProgress(w, t) > 0) sung++;
      const hl = Math.min(CODE.length - 1, Math.floor(prog(t, words[0]!.start, words[words.length - 1]!.end) * 7) + 1);
      const lh = 58, size = 32;
      const scroll = lerp(H * 0.5, H * 0.1, prog(t, this.cutAt(line), words[words.length - 1]!.end + 0.3, ease.inOutCubic));
      c.save();
      c.beginPath(); c.rect(0, 40, W, H - 280); c.clip();
      c.font = font(F.mono(500), size);
      CODE.forEach((s, i) => {
        const y = scroll + i * lh;
        if (i === hl) {
          c.fillStyle = rgba('ink');
          c.fillRect(100, y - size * 0.95, W - 200, lh);
          c.fillStyle = rgba('signal');
        } else c.fillStyle = rgba('ink', 0.72);
        c.fillText(s, 130, y);
      });
      c.restore();
      void sung;
      lyricLine(c, line, t, 120, H - 90, { family: F.archivo(112, 900), size: 80, on: FG(), off: FG(0.3) });
    } else if (kind === 'one') {
      // "1" on "One", "O" on "key": the key mark, big; on "OneKey" it lands on the real device's screen
      const wOne = line.words[0]!, wKey = line.words[1]!, wOK = line.words[2]!;
      const MH = 560, cx = W / 2, cy = H * 0.43;
      const k1 = prog(t, wOne.start - 0.02, wOne.start + 0.14, ease.outExpo);
      const k2 = prog(t, wKey.start - 0.02, wKey.start + 0.14, ease.outExpo);
      const devIn = prog(t, wOK.start - 0.08, wOK.start + 0.35, ease.inOutCubic);
      const col = n2 ? rgba('ink') : rgba('signal');
      const k = MH / KEY.height;
      c.save();
      // the big mark shrinks into the screen as the device arrives
      const ms = lerp(1, 0.32, devIn);
      c.translate(cx, cy); c.scale(ms, ms); c.translate(-cx, -cy);
      c.globalAlpha = 1 - devIn;
      if (k1 > 0) {
        c.save();
        c.translate(0, lerp(-240, 0, k1));
        c.beginPath();
        KEY.one.forEach((q, i) => { const p = keyPt(q, cx, cy, MH); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
        c.closePath();
        c.fillStyle = col; c.globalAlpha = clamp(k1 * 3) * (1 - devIn); c.fill();
        c.restore();
      }
      if (k2 > 0) {
        const rc = keyPt([KEY.ring.cx, KEY.ring.cy], cx, cy, MH);
        const s2 = lerp(1.6, 1, k2);
        c.save();
        c.globalAlpha = clamp(k2 * 3) * (1 - devIn);
        c.beginPath();
        c.arc(rc.x, rc.y, KEY.ring.R * k * s2, 0, TAU);
        c.arc(rc.x, rc.y, KEY.ring.r * k * s2, 0, TAU, true);
        c.fillStyle = col; c.fill('evenodd');
        c.restore();
      }
      c.restore();
      flash = Math.max(flash, (n2 ? 0 : 0.04) * (Math.pow(0.5, Math.max(0, t - wOne.start) / 0.03) * (t >= wOne.start ? 1 : 0) + Math.pow(0.5, Math.max(0, t - wKey.start) / 0.03) * (t >= wKey.start ? 1 : 0)));
      if (devIn > 0) {
        // "all yours": it turns a little towards us, three-quarter
        const yours = prog(t, line.words[3]?.start ?? wOK.end, line.words[line.words.length - 1]!.end + 0.4, ease.inOutCubic);
        const T: [number, number, number] = [0.5, -0.06, 0];
        devPose = { cam: orbit(T, lerp(6.0, 5.2, devIn), 0, 0.05), tgt: T, fov: 0.5, rot: [lerp(0, -0.42, yours), lerp(0, 0.06, yours), 0], screen: 1, sweep: lerp(-1.4, 1.4, yours) };
        devOpacity = devIn;
        screen = 'mark';
        const ko = prog(t, wOK.start, wOK.start + 0.3, ease.outCubic);
        c.font = font(F.archivo(100, 900), 96);
        c.fillStyle = FG(ko);
        c.fillText('OneKey', W * 0.56, H * 0.49);
      }
      caption = line;
    } else {
      // HOLD / SIGN / GO slam behind the real device: held up on "Hold", signed on "sign", a spin on
      // "go"; then it keeps turning slowly with the mark on its screen for the next plate
      const hw = line.words;
      const hold = hw.find((w) => w.w.startsWith('Hold'))!, sign = hw.find((w) => w.w.startsWith('sign'))!, go = hw[hw.length - 1]!;
      const after = t >= go.end - 0.1;
      if (!after) {
        const w = t >= go.start ? go : t >= sign.start ? sign : hold;
        slam(w, w === go ? 'GO' : w === sign ? 'SIGN' : 'HOLD');
      }
      const pop = t >= hold.start ? springStep(t - hold.start, 3.2, 0.45) : 0;
      const spin = prog(t, go.start - 0.05, go.start + 0.8, ease.inOutCubic);
      const drift = Math.max(0, t - (go.start + 0.8)) * 0.35;
      const T: [number, number, number] = [0, 0, 0];
      devPose = {
        cam: orbit(T, 5.6, 0, 0.06), tgt: T, fov: 0.5, scale: lerp(0.7, 1, clamp(pop)),
        rot: [-0.3 + spin * TAU + drift, 0.08, lerp(0.06, 0, spin)], screen: 1,
        sweep: lerp(-1.4, 1.4, prog(t, sign.start, sign.start + 0.8, ease.inOutCubic)),
      };
      devOpacity = prog(t, this.cutAt(line), this.cutAt(line) + 0.15);
      screen = t >= sign.start && t < go.start + 0.4 ? 'signed' : 'mark';
    }

    comp.draw(renderer, this.text.upload(), out);
    if (devPose) {
      const sc = this.dev.screen.ctx;
      this.dev.screen.clear(rgba('ink'));
      if (screen === 'signed') {
        sc.strokeStyle = rgba('signal');
        sc.lineWidth = 18; sc.lineCap = 'round';
        sc.beginPath(); sc.moveTo(SCREEN.w * 0.3, SCREEN.h * 0.45); sc.lineTo(SCREEN.w * 0.45, SCREEN.h * 0.54); sc.lineTo(SCREEN.w * 0.72, SCREEN.h * 0.36); sc.stroke();
        sc.lineCap = 'butt';
        sc.font = font(F.archivo(100, 800), 64);
        sc.fillStyle = rgba('bone');
        const tw = sc.measureText('Signed').width;
        sc.fillText('Signed', (SCREEN.w - tw) / 2, SCREEN.h * 0.7);
      } else {
        sc.fillStyle = rgba('signal');
        sc.fill(keyMarkPath(SCREEN.w / 2, SCREEN.h * 0.47, 200), 'evenodd');
      }
      comp.draw(renderer, this.dev.render(renderer, devPose), out, { opacity: devOpacity });
    }
    if (caption) {
      this.front.clear();
      lyricLine(this.front.ctx, caption, t, 120, H - 90, { family: F.archivo(100, 800), size: 72, on: FG(), off: FG(0.3) });
      comp.draw(renderer, this.front.upload(), out);
    }
    return { bloom: n2 ? 0.08 : kind === 'keep' || kind === 'hold' ? 0.12 : 0.35, vignette: n2 ? 0.12 : 0.35, halation: n2 ? 0 : 0.2, flash };
  }
}
