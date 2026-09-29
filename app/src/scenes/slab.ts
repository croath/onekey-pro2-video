// `slab` (verse 1, lines 1–4) — docs/TREATMENT.md: the device's first full appearance, rendered
// procedurally (raymarched SDF) from the proportions in _motifs DEVICE; one shot per lyric line:
//   1 "Glass on the front and glass on the back": front three-quarter, a highlight sweeps the
//     black glass; on "back" the slab flips 180° about its long axis.
//   2 "A ribbon of metal, graphite and black": macro along the metal frame; antenna breaks pass.
//   3 "Thin as a card, it slips out of sight": straight on the back, a bank card's outline slides over
//     it (the same footprint); after "card" the slab turns side-on, a thin bar (6.2 mm); on "out" it slides away.
//   4 "One little key mark catching the light": the back, head-on; a light sweeps the frosted
//     glass and the "1O" mark glints green on "light".
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog } from '../engine/util';
import { DEVICE, KEY } from './_motifs';

const D = DEVICE;
const v2 = (x: number, y: number) => `vec2(${x.toFixed(4)}, ${y.toFixed(4)})`;
// key mark "1" outline in device units on the back (seen from behind: x mirrored in device space)
const MK = D.mark.h / KEY.height;
const onePoly = KEY.one.map(([x, y]) => v2(-(x - KEY.centre.x) * MK + D.mark.x * -1, -(y - KEY.centre.y) * MK + D.mark.y));
const ringC = v2(-(KEY.ring.cx - KEY.centre.x) * MK - D.mark.x, -(KEY.ring.cy - KEY.centre.y) * MK + D.mark.y);

const FRAG = /* glsl */ `
uniform vec3 camPos, camTgt;
uniform float fov, theta, slideX, sweep, glint, time, gain;
const vec2 HALF = vec2(${(D.w / 2).toFixed(4)}, ${(D.h / 2).toFixed(4)});
const float TH = ${(D.t / 2).toFixed(4)}, CORNER = ${D.corner.toFixed(4)}, RE = 0.028;

float sdRoundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

// the slab: rounded-rect outline extruded, faces rounded into the frame by RE
float sdDevice(vec3 p) {
  float d2 = sdRoundRect(p.xy, HALF - RE, CORNER - RE);
  vec2 w = vec2(d2, abs(p.z) - (TH - RE));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - RE;
}
vec3 toDev(vec3 p) {
  p.x -= slideX;
  float c = cos(theta), s = sin(theta);
  return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}
vec3 fromDevDir(vec3 d) {
  float c = cos(-theta), s = sin(-theta);
  return vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
}
float map(vec3 p) { return sdDevice(toDev(p)); }
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0007, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

// studio: black room; a big top softbox, a tall strip left, a thin rim strip right, a sweeping bar,
// and a faint floor/ceiling gradient so mirror surfaces always pick something up
vec3 env(vec3 r) {
  float top = smoothstep(0.5, 0.62, r.y) * smoothstep(0.75, 0.6, abs(r.x + 0.15)) * smoothstep(0.8, 0.6, abs(r.z + 0.05));
  float left = smoothstep(-0.78, -0.86, r.x) * smoothstep(0.55, 0.45, abs(r.y - 0.1)) * smoothstep(-0.3, 0.1, r.z);
  float rim = smoothstep(0.9, 0.95, r.x) * smoothstep(0.5, 0.35, abs(r.y));
  float bar = smoothstep(0.09, 0.03, abs(r.x - sweep)) * smoothstep(-0.2, 0.3, r.z) * smoothstep(0.9, 0.5, abs(r.y));
  // a large soft panel behind the camera, up-left, with one diagonal edge: what the glossy front
  // mirrors when it faces us (a dark glass with a clean diagonal reflection)
  float e = (r.x + 0.38) + (r.y + 0.08) * 1.3;
  float panel = smoothstep(0.3, 0.6, r.z) * smoothstep(0.03, -0.03, e) * smoothstep(-0.9, -0.3, e) * smoothstep(-0.9, -0.4, r.x);
  float amb = mix(0.012, 0.05, smoothstep(-0.6, 0.8, r.y));
  return vec3(0.93, 1.0, 0.96) * (top * 3.0 + left * 1.6 + rim * 2.0 + bar * 3.5 + panel * 0.9 + amb);
}

float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float sdPoly6(vec2 p) {
  vec2 v[6] = vec2[6](${onePoly.join(', ')});
  float d = dot(p - v[0], p - v[0]); float s = 1.0;
  for (int i = 0, j = 5; i < 6; j = i, i++) {
    vec2 e = v[j] - v[i], w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}
float sdMark(vec2 p) {
  float one = sdPoly6(p);
  float r = length(p - ${ringC});
  float ring = max(r - ${(KEY.ring.R * MK).toFixed(5)}, ${(KEY.ring.r * MK).toFixed(5)} - r);
  return min(one, ring);
}

vec3 shade(vec3 pw, vec3 rd) {
  vec3 p = toDev(pw);
  vec3 nw = normalAt(pw);
  vec3 n = normalize(toDev(pw + nw * 0.001) - p);   // normal in device space
  vec3 v = -rd;
  vec3 r = reflect(rd, nw);
  float fres = pow(1.0 - max(dot(nw, v), 0.0), 5.0);
  float px = fwidth(p.x) + fwidth(p.y) + 1e-5;
  vec3 col;
  if (n.z > 0.75) {
    // front: black glass, a mirror of the studio
    col = C_INK * 0.2 + env(r) * mix(0.09, 1.0, fres);
  } else if (n.z < -0.75) {
    // back: frosted glass, light grey at the top to graphite at the bottom, soft broad highlights
    float g = smoothstep(-HALF.y, HALF.y, p.y);
    vec3 base = mix(C_GRAPHITE * 0.35, C_ASH * 0.75, g * g);
    vec3 blur = env(normalize(mix(r, nw, 0.55))) * 0.1 + env(normalize(mix(r, nw, 0.8))) * 0.12;
    col = base * (0.3 + 0.7 * max(dot(nw, normalize(vec3(-0.4, 0.8, 0.6))), 0.0)) + blur + env(r) * 0.03 * fres;
    col += 0.004 * snoise(p.xy * 900.0);
    // key mark, printed dark; glints green
    float dm = sdMark(p.xy);
    float m = 1.0 - smoothstep(-px, px, dm);
    col = mix(col, mix(C_INK * 0.6, C_SIGNAL * 2.5, glint), m);
    col += C_SIGNAL * glint * 0.35 * exp(-max(dm, 0.0) * 60.0);
    // rear camera (seen from behind: top-left), a raised metal ring round a dark lens
    vec2 cc = vec2(-(${D.cam.x.toFixed(4)}), ${D.cam.y.toFixed(4)});
    float dc = length(p.xy - cc);
    float ring = smoothstep(${D.cam.r.toFixed(4)} + px, ${D.cam.r.toFixed(4)} - px, dc) * smoothstep(${(D.cam.r * 0.62).toFixed(4)} - px, ${(D.cam.r * 0.62).toFixed(4)} + px, dc);
    float lens = smoothstep(${(D.cam.r * 0.62).toFixed(4)} + px, ${(D.cam.r * 0.62).toFixed(4)} - px, dc);
    vec3 metal = mix(C_GRAPHITE, C_BONE, 0.5 + 0.5 * sin(atan(p.y - cc.y, p.x - cc.x) * 2.0 + 1.0)) * 0.9 + env(r) * 0.5;
    col = mix(col, metal, ring);
    col = mix(col, vec3(0.004) + env(r) * 0.3 * fres + vec3(0.02, 0.03, 0.025) * smoothstep(0.03, 0.0, length(p.xy - cc + 0.012)), lens);
  } else {
    // the frame: graphite metal, brushed along the edge, with antenna breaks, port and holes
    // polished metal (graphite-tinted mirror, like a polished titanium band)
    vec3 tintM = mix(C_GRAPHITE, C_BONE, 0.35);
    col = tintM * 0.03 + env(r) * tintM * mix(0.4, 0.8, fres);
    // antenna breaks: thin dark bands across the frame near the corners
    float br = min(abs(abs(p.y) - 0.60), abs(abs(p.x) - 0.33) + step(0.1, HALF.y - abs(p.y)) * 9.0);
    col = mix(col, C_INK * 0.4, (1.0 - smoothstep(0.0025, 0.0045, br)) * step(abs(p.z), TH * 0.95));
    // bottom edge: USB-C slot in the middle, three speaker holes to its right
    if (p.y < -HALF.y + 0.05) {
      float slot = sdRoundRect(vec2(p.x, p.z), vec2(0.062, 0.017), 0.017);
      col = mix(col, vec3(0.002), 1.0 - smoothstep(-0.002, 0.002, slot));
      for (int i = 0; i < 3; i++) {
        float dh = length(vec2(p.x - (0.15 + 0.03 * float(i)), p.z)) - 0.008;
        col = mix(col, vec3(0.002), 1.0 - smoothstep(-0.0015, 0.0015, dh));
      }
    }
    // side button on the right edge
    if (p.x > HALF.x - 0.05) {
      float bt = sdRoundRect(vec2(p.y - 0.33, p.z), vec2(0.075, 0.022), 0.02);
      col = mix(col, col * 1.6 + 0.02, 1.0 - smoothstep(-0.002, 0.002, bt));
      col = mix(col, C_INK * 0.3, 1.0 - smoothstep(0.0, 0.0025, abs(bt)));
    }
  }
  return col;
}

void main() {
  vec2 uv = (FRAG_PX - vec2(${(W / 2).toFixed(1)}, ${(H / 2).toFixed(1)})) / ${(H / 2).toFixed(1)};
  vec3 fw = normalize(camTgt - camPos), rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))), up = cross(rt, fw);
  vec3 rd = normalize(fw + (uv.x * rt + uv.y * up) * tan(fov * 0.5));
  // background: ink with a faint cool pool of light behind the device
  vec3 col = C_INK * (1.0 + 0.9 * exp(-dot(uv, uv) * 1.2));
  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 128; i++) {
    vec3 p = camPos + rd * t;
    float d = map(p);
    if (d < 0.0004 * t) { hit = true; break; }
    t += d * 0.9;
    if (t > 30.0) break;
  }
  if (hit) col = shade(camPos + rd * t, rd) * gain;
  fragColor = vec4(col, 1.0);
}`;

/** Shot 3 (the card comparison) camera: straight on, long lens; px per device unit at the slab. */
const SIDE = { cy: -0.25, dist: 11.5, fov: 0.22 };
const SIDE_PPU = H / 2 / Math.tan(SIDE.fov / 2) / SIDE.dist;
/** ISO/IEC 7810 ID-1 card in device units (device width 53.1 mm). */
const CARD = { w: 53.98 / 53.1, h: 85.6 / 53.1, r: 3.18 / 53.1 };

type Shot = { cam: [number, number, number]; tgt: [number, number, number]; fov: number; theta: number; slideX: number; sweep: number; glint: number };

export default class Slab extends Scene {
  pass = new FSPass(FRAG, {
    camPos: { value: [0, 0, 3] }, camTgt: { value: [0, 0, 0] }, fov: { value: 0.6 }, theta: { value: 0 },
    slideX: { value: 0 }, sweep: { value: -2 }, glint: { value: 0 }, time: { value: 0 }, gain: { value: 1 },
  });
  text = new Layer2D();
  L: Line[] = [];

  override init() {
    const ly = this.ctx.lyrics;
    this.L = ['Glass on the front', 'A ribbon of metal', 'Thin as a card', 'One little key mark'].map((q) => ly.get(q));
  }

  /** Start of shot i: the beat at/before its line's first word (the timeline's cut rule). */
  cutAt(i: number) {
    const au = this.ctx.audio;
    if (i === 0) return this.ctx.start;
    return au.timeOfBeat(Math.floor(au.beatAt(this.L[i]!.words[0]!.start + 0.02)));
  }

  shot(t: number): { i: number; s: Shot } {
    const [l1, l2, l3, l4] = this.L as [Line, Line, Line, Line];
    const c1 = this.cutAt(1), c2 = this.cutAt(2), c3 = this.cutAt(3);
    const word = (l: Line, q: string) => l.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    if (t < c1) {
      const back = word(l1, 'back').start;
      const k = prog(t, this.ctx.start, c1);
      const flip = prog(t, back - 0.05, back + 0.55, ease.outExpo);
      const yaw = lerp(0.42, 0.3, k), dist = lerp(4.6, 4.2, k);
      return { i: 0, s: {
        cam: [Math.sin(yaw) * dist, 0.45, Math.cos(yaw) * dist], tgt: [0, -0.22, 0], fov: 0.62,
        theta: flip * Math.PI, slideX: 0,
        // the highlight crosses the glass while "Glass on the front" is sung
        sweep: lerp(-1.6, 1.6, prog(t, l1.words[0]!.start, word(l1, 'front').end, ease.inOutCubic)), glint: 0,
      } };
    }
    if (t < c2) {
      // macro along the right edge (seen from behind after the flip), travelling up the frame
      const k = prog(t, c1, c2, ease.inOutQuad);
      const y = lerp(-0.55, 0.45, k);
      return { i: 1, s: {
        cam: [-0.78, y - 0.42, 0.3], tgt: [-0.5, y + 0.2, 0.0], fov: 0.55,
        theta: Math.PI, slideX: 0, sweep: lerp(-1.2, 1.2, k), glint: 0,
      } };
    }
    if (t < c3) {
      // straight on the back, long lens: a bank card's outline slides over it (same footprint); on
      // "it" the slab turns side-on and reads as a thin bar (6.2 mm); it slides out of frame on "out"
      const out = word(l3, 'out').start;
      const turn = Math.min(word(l3, 'it').start, word(l3, 'card').start + 0.75);
      const sx = lerp(0, -3.2, prog(t, out - 0.05, word(l3, 'sight').end + 0.1, ease.inCubic));
      return { i: 2, s: {
        cam: [0, SIDE.cy, SIDE.dist], tgt: [0, SIDE.cy, 0], fov: SIDE.fov,
        theta: lerp(Math.PI, Math.PI * 0.5, prog(t, turn - 0.12, turn + 0.45, ease.inOutCubic)), slideX: sx, sweep: -2, glint: 0,
      } };
    }
    // the back, head-on and slightly high; the light sweeps across on "catching the light"
    const light = word(l4, 'light');
    const k = prog(t, c3, this.ctx.end);
    return { i: 3, s: {
      cam: [0.12, lerp(0.45, 0.3, k), lerp(4.4, 4.0, k)], tgt: [0, -0.2, 0], fov: 0.62,
      theta: Math.PI, slideX: 0,
      sweep: lerp(1.8, -1.8, prog(t, word(l4, 'catching').start, light.end + 0.2, ease.inOutCubic)),
      glint: Math.exp(-Math.max(0, t - light.start) / 0.6) * (t >= light.start ? 1 : prog(t, light.start - 0.12, light.start)),
    } };
  }

  /** Shot 3 overlay: the bank card's outline over the slab, then the 6.2 mm dimension once side-on. */
  cardOverlay(c: CanvasRenderingContext2D, t: number) {
    const l3 = this.L[2]!;
    const word = (q: string) => l3.words.find((w) => w.w.toLowerCase().startsWith(q))!;
    const card = word('card'), turn = Math.min(word('it').start, card.start + 0.75), out = word('out').start;
    const cx = W / 2, cy = H / 2 - (0 - SIDE.cy) * SIDE_PPU; // the slab's centre on screen
    const ww = CARD.w * SIDE_PPU, hh = CARD.h * SIDE_PPU;
    c.font = font(F.mono(400), 22);
    // the card slides in from the left and settles over the slab, then fades as the slab turns
    const kIn = prog(t, card.start - 0.15, card.start + 0.45, ease.outExpo);
    const kOut = 1 - prog(t, turn - 0.1, turn + 0.25);
    const a = kIn * kOut;
    if (a > 0) {
      const x = lerp(cx - W * 0.4, cx, kIn);
      c.globalAlpha = a;
      c.strokeStyle = rgba('bone', 0.9);
      c.lineWidth = 1.5;
      c.setLineDash([10, 7]);
      c.beginPath();
      c.roundRect(x - ww / 2, cy - hh / 2, ww, hh, CARD.r * SIDE_PPU);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = rgba('bone', 0.85);
      c.fillText('bank card   85.6 × 54.0 mm', x + ww / 2 + 28, cy - hh / 2 + 18);
      c.fillStyle = rgba('bone', 0.55);
      c.fillText('OneKey Pro 2   84.9 × 53.1 mm', x + ww / 2 + 28, cy - hh / 2 + 50);
      c.globalAlpha = 1;
    }
    // side-on: the thickness, as a dimension line above the bar
    const kD = prog(t, turn + 0.3, turn + 0.55, ease.outCubic) * (1 - prog(t, out + 0.05, out + 0.25));
    if (kD > 0) {
      const half = (DEVICE.t / 2) * SIDE_PPU, y = cy - (DEVICE.h / 2) * SIDE_PPU - 34;
      c.globalAlpha = kD;
      c.strokeStyle = rgba('bone', 0.9);
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(cx - half, y - 10); c.lineTo(cx - half, y + 10);
      c.moveTo(cx + half, y - 10); c.lineTo(cx + half, y + 10);
      c.moveTo(cx - half - 40, y); c.lineTo(cx - half, y);
      c.moveTo(cx + half + 40, y); c.lineTo(cx + half, y);
      c.stroke();
      c.fillStyle = rgba('bone', 0.95);
      c.fillText('6.2 mm', cx + half + 52, y + 7);
      c.globalAlpha = 1;
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const { i, s } = this.shot(f.t);
    const u = this.pass.u;
    u.camPos!.value = s.cam; u.camTgt!.value = s.tgt; u.fov!.value = s.fov; u.theta!.value = s.theta;
    u.slideX!.value = s.slideX; u.sweep!.value = s.sweep; u.glint!.value = s.glint; u.time!.value = f.t; u.gain!.value = i === 1 ? 0.4 : 1; // the macro sits right under the softbox
    this.pass.render(renderer, out);

    // ---- lyric: one line per shot, set in Archivo, sung words in bone, the rest dim
    const c = this.text.ctx;
    this.text.clear();
    const line = this.L[i]!;
    const fam = F.archivo(100, 800);
    const size = 78;
    const lay = layout(line.text, fam, size);
    const x0 = 120, y0 = H - 150;
    c.font = font(fam, size);
    let ci = 0;
    for (const w of line.words) {
      const k = Lyrics.wordProgress(w, f.t);
      const early = prog(f.t, w.start - 0.4, w.start);
      const i0 = line.text.indexOf(w.w, ci);
      ci = i0 + w.w.length;
      const g = lay.glyphs[i0];
      if (!g) continue;
      c.fillStyle = rgba('bone', k > 0 ? 1 : 0.18 + 0.17 * early);
      c.fillText(w.w, x0 + g.x, y0 - (1 - ease.outExpo(clamp(k * 4))) * 10 * (k > 0 ? 1 : 0));
    }
    if (i === 2) this.cardOverlay(c, f.t);
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.45, vignette: 0.4 };
  }
}
