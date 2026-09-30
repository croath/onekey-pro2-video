// `boot` (intro, ~6 bars) — docs/TREATMENT.md: a green point wakes like a standby light and breathes
// through the song's soft opening (bars 1–2), writes the "1" of the key mark (bar 3) and the "O"
// (bar 4) as the drums come in, the strokes swell into the solid mark (held for bar 5), and in bar 6
// the camera dives into the "O", which turns into the metal ring of the rear camera. Hard cut to
// `slab` on the vocal's entry.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { clamp, ease, lerp, prog, TAU } from '../engine/util';
import { KEY, keyHead, keyParticles, keyPt, keyMarkPath } from './_motifs';
import { Device3D } from './_device3d';
import { OPENING, openingPose, pullK } from './_space';

const CX = W / 2, CY = H / 2;
const MARK_H = OPENING.markH;

type P2 = { x: number; y: number };

/** Point at arc length s along a polyline (and the lengths). */
function along(pts: P2[], s: number): P2 {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (s <= L) return { x: a.x + ((b.x - a.x) * s) / L, y: a.y + ((b.y - a.y) * s) / L };
    s -= L;
  }
  return pts[pts.length - 1]!;
}
const plen = (pts: P2[]) => pts.slice(1).reduce((L, b, i) => L + Math.hypot(b.x - pts[i]!.x, b.y - pts[i]!.y), 0);

/** Local bar (0 = the first downbeat) -> the choreography's bar: 2 bars of standby for the soft
 * opening, then the writing, a bar holding the solid mark, then the dive. */
function chor(b: number): number {
  if (b < 2) return b / 2;
  if (b < 4.05) return b - 1;
  if (b < 5) return 3.05;
  return b - 2;
}

export default class Boot extends Scene {
  bg = new FSPass(
    /* glsl */ `
    uniform float glass;   // 0..1 the frosted back glass fades in behind the ring
    uniform vec2 ringC;    // ring centre in px (y down)
    uniform float ringR;
    void main() {
      vec2 px = vec2(FRAG_PX.x, ${H.toFixed(1)} - FRAG_PX.y);
      // frosted back: lighter at the top, graphite at the bottom, with a soft sheen
      float g = smoothstep(${H.toFixed(1)} * 1.2, -${(H * 0.2).toFixed(1)}, px.y);
      vec3 back = mix(C_INK2, C_GRAPHITE * 0.9, g * 0.8);
      back += 0.015 * snoise(px * 0.9);                    // frost
      float d = length(px - ringC);
      back *= 0.75 + 0.25 * smoothstep(ringR * 0.9, ringR * 3.0, d);  // contact shadow round the ring
      fragColor = vec4(mix(C_INK, back, glass), 1.0);
    }`,
    { glass: { value: 0 }, ringC: { value: [CX, CY] }, ringR: { value: 100 } },
  );
  text = new Layer2D();
  lines = new LineBatch(4000, { screen2D: true, blend: 'add' });
  dev = new Device3D();
  bg3 = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    // local bar position: 0 at the scene's first downbeat
    const b0 = f.bar - audio.barAt(audio.downbeats[0]!);
    const b = chor(b0);

    // ---- camera: in bar 4 dive towards the ring centre
    const ringC0 = keyPt([KEY.ring.cx, KEY.ring.cy], CX, CY, MARK_H);
    const kpx = MARK_H / KEY.height;
    const dive = prog(b, 3.0, 4.0, ease.inOutCubic);
    const zoom = lerp(1, OPENING.zoom, dive);
    // the ring's centre moves from its place to the frame's left third (it is the camera, top-left of the back)
    const target = { x: lerp(ringC0.x, OPENING.at[0], dive), y: lerp(ringC0.y, OPENING.at[1], dive) };
    const T = (p: P2): P2 => ({ x: target.x + (p.x - ringC0.x) * zoom, y: target.y + (p.y - ringC0.y) * zoom });
    const S = (p: [number, number]) => T(keyPt(p, CX, CY, MARK_H));

    // ---- strokes
    const onePts = KEY.oneStroke.map((p) => S(p));
    const oneL = plen(onePts);
    const w1 = prog(b, 1.0, 1.9, ease.inOutCubic); // "1" written in bar 2
    const w2 = prog(b, 2.0, 2.85, ease.inOutCubic); // "O" in bar 3
    const swell = prog(b, 2.8, 3.05, ease.outExpo); // hairline -> solid mark
    const rc = T(ringC0), rMid = KEY.ringMid * kpx * zoom, rOuter = KEY.ring.R * kpx * zoom;
    const a0 = -Math.PI / 2; // the O starts at its top and runs clockwise
    const ringAt = (k: number): P2 => ({ x: rc.x + Math.cos(a0 + k * TAU) * rMid, y: rc.y + Math.sin(a0 + k * TAU) * rMid });

    // where the pen is at time t (for the head and its particles)
    const headAt = (t: number): P2 | null => {
      const bb = chor(audio.barAt(t) - audio.barAt(audio.downbeats[0]!));
      if (bb < 1.0) {
        const p0 = onePts[0]!;
        // standby: resting at the pen's start, drifting in from the centre during bar 1
        const k = prog(bb, 0.35, 1.0, ease.inOutCubic);
        return { x: lerp(CX, p0.x, k), y: lerp(CY, p0.y, k) };
      }
      if (bb < 1.9) return along(onePts, oneL * prog(bb, 1.0, 1.9, ease.inOutCubic));
      if (bb < 2.0) return ringAt(0);
      if (bb < 2.85) return ringAt(prog(bb, 2.0, 2.85, ease.inOutCubic));
      return null;
    };

    // ---- background
    this.bg.u.glass!.value = prog(b, 3.1, 3.9, ease.inOutCubic);
    this.bg.u.ringC!.value = [rc.x, rc.y];
    this.bg.u.ringR!.value = rOuter;
    this.bg.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
    const hair = 2.2;
    const green = rgba('signal', 1);

    if (swell < 1) {
      c.save();
      if (swell > 0) {
        // as the strokes swell they fill the mark's own outline and never spill past it
        c.translate(target.x, target.y);
        c.scale(zoom, zoom);
        c.translate(-ringC0.x, -ringC0.y);
        c.clip(keyMarkPath(CX, CY, MARK_H), 'evenodd');
        c.setTransform(1, 0, 0, 1, 0, 0);
      }
      c.strokeStyle = green;
      // "1": hairline growing to its full stroke width as it swells
      if (w1 > 0) {
        c.lineWidth = lerp(hair, KEY.oneW * kpx * zoom, swell);
        c.beginPath();
        let s = oneL * w1;
        c.moveTo(onePts[0]!.x, onePts[0]!.y);
        for (let i = 1; i < onePts.length && s > 0; i++) {
          const a = onePts[i - 1]!, q = onePts[i]!;
          const L = Math.hypot(q.x - a.x, q.y - a.y), k = Math.min(1, s / L);
          c.lineTo(a.x + (q.x - a.x) * k, a.y + (q.y - a.y) * k);
          s -= L;
        }
        c.stroke();
      }
      if (w2 > 0) {
        c.lineWidth = lerp(hair, KEY.ringW * kpx * zoom, swell);
        c.beginPath();
        c.arc(rc.x, rc.y, rMid, a0, a0 + w2 * TAU);
        c.stroke();
      }
      c.restore();
    }
    if (swell > 0) {
      // the solid mark (exact logo outline) fades in over the swelling strokes
      const m = keyMarkPath(CX, CY, MARK_H);
      c.save();
      c.translate(target.x, target.y);
      c.scale(zoom, zoom);
      c.translate(-ringC0.x, -ringC0.y);
      // in bar 4 the "1" leaves (it slides up out of the frame as we dive into the O)
      c.globalAlpha = swell * (1 - prog(b, 3.0, 3.5, ease.inCubic));
      c.fillStyle = green;
      c.fill(m, 'evenodd');
      c.restore();
    }

    // ---- bar 4: the O becomes the rear camera's metal ring
    const metal = prog(b, 3.15, 3.8, ease.inOutCubic);
    if (metal > 0) {
      const R = rOuter, r = KEY.ring.r * kpx * zoom;
      // brushed ring: a conic sweep of graphite/ash/bone
      const g = c.createConicGradient(-0.6, rc.x, rc.y);
      g.addColorStop(0, rgba('graphite', 1));
      g.addColorStop(0.18, rgba('bone', 0.95));
      g.addColorStop(0.32, rgba('ash', 1));
      g.addColorStop(0.55, rgba('ink2', 1));
      g.addColorStop(0.72, rgba('ash', 1));
      g.addColorStop(0.86, rgba('bone', 0.8));
      g.addColorStop(1, rgba('graphite', 1));
      c.globalAlpha = metal;
      c.beginPath();
      c.arc(rc.x, rc.y, R, 0, TAU);
      c.arc(rc.x, rc.y, r, 0, TAU, true);
      c.fillStyle = g;
      c.fill('evenodd');
      // the lens: deep glass with one soft glint
      const lg = c.createRadialGradient(rc.x - r * 0.3, rc.y - r * 0.35, r * 0.05, rc.x, rc.y, r);
      lg.addColorStop(0, 'rgba(120,140,130,0.9)');
      lg.addColorStop(0.25, 'rgba(20,24,22,1)');
      lg.addColorStop(1, 'rgba(4,5,5,1)');
      c.beginPath();
      c.arc(rc.x, rc.y, r, 0, TAU);
      c.fillStyle = lg;
      c.fill();
      c.globalAlpha = 1;
    }
    comp.draw(renderer, this.text.upload(), out);

    // ---- the ring is the real device's rear camera: the 3D device fades in over it, framed exactly
    // like the 2D ring, and from the last downbeat the camera starts to pull back (slab carries on)
    const real = prog(b, 3.7, 4.0, ease.inOutCubic);
    if (real > 0) {
      this.bg3.clear(rgba('ink'));
      const g = this.bg3.ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.9);
      g.addColorStop(0, 'rgba(26,29,27,1)');
      g.addColorStop(1, rgba('ink'));
      this.bg3.ctx.fillStyle = g;
      this.bg3.ctx.fillRect(0, 0, W, H);
      comp.draw(renderer, this.bg3.upload(), out, { opacity: real });
      comp.draw(renderer, this.dev.render(renderer, openingPose(pullK(audio, this.ctx.lyrics, f.t))), out, { opacity: real });
    }

    // ---- the key light: head + sputter, on top (additive)
    this.lines.clear();
    const h = headAt(f.t);
    if (h) {
      // bar 1: it breathes with the kick like a standby LED
      const idle = b < 1 ? 0.55 + 0.3 * f.a.kick + 0.2 * Math.sin(f.t * 2.4) : 1;
      const born = prog(f.t, 0.15, 0.9, ease.outCubic);
      keyHead(this.lines, h.x, h.y, f.t, 1, idle * born);
      if (b >= 1) keyParticles(this.lines, f.t, headAt, { rate: 60, speed: 120, life: 0.35, intensity: 0.8 });
    }
    this.lines.render(renderer, out);

    return { bloom: 0.6, vignette: 0.35, flash: 0.07 * Math.pow(0.5, Math.max(0, b - 2.85) / 0.03) * (b >= 2.85 ? 1 : 0) };
  }
}
