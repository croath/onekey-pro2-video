// Product-macro finishing for the board shots (below, vault): a shallow depth of field. The device
// render is blurred per pixel by its circle of confusion, from the depth of a world plane (the board)
// along each pixel's ray, so the focus falls off in front of and behind the focus distance the way a
// macro lens does. Cheap: one fullscreen pass with a 20-tap golden-angle gather.
import * as THREE from 'three';
import { FSPass, W, H, makeRT } from '../engine/gl';
import type { DevicePose, V3 } from './_device3d';
import { basis } from './_space';

export class Macro {
  rt = makeRT();
  pass = new FSPass(/* glsl */ `
    uniform sampler2D tex;
    uniform vec3 camPos, fw, rt, up, P0, N;
    uniform float tf, zf, k, maxR;
    void main() {
      vec2 px = vUv * vec2(${W.toFixed(1)}, ${H.toFixed(1)});
      vec2 uv = (px - vec2(${(W / 2).toFixed(1)}, ${(H / 2).toFixed(1)})) / ${(H / 2).toFixed(1)};
      vec3 rd = normalize(fw + (uv.x * rt + uv.y * up) * tf);
      float dn = dot(rd, N);
      float t = abs(dn) > 1e-4 ? dot(P0 - camPos, N) / dn : -1.0;
      float z = t > 0.0 ? t * dot(rd, fw) : 1e3;
      float coc = clamp(k * abs(1.0 - zf / z), 0.0, maxR);
      vec4 acc = texture(tex, vUv);
      float wsum = 1.0;
      if (coc > 0.35) {
        for (int i = 1; i < 20; i++) {
          float r = sqrt(float(i) / 19.0) * coc, a = float(i) * 2.39996;
          acc += texture(tex, vUv + vec2(cos(a), sin(a)) * r / vec2(${W.toFixed(1)}, ${H.toFixed(1)}));
          wsum += 1.0;
        }
      }
      fragColor = acc / wsum;
    }`, {
    tex: { value: null }, camPos: { value: new THREE.Vector3() }, fw: { value: new THREE.Vector3() }, rt: { value: new THREE.Vector3() },
    up: { value: new THREE.Vector3() }, P0: { value: new THREE.Vector3() }, N: { value: new THREE.Vector3() },
    tf: { value: 0.3 }, zf: { value: 1 }, k: { value: 0 }, maxR: { value: 14 },
  });
  /**
   * Blur `tex` (the device render under `pose`) for a lens focused at world point `focus`; depth comes
   * from the plane through `p0` with normal `n`. `k` = blur in px per unit of |1 - zf/z| (0 = off).
   */
  dof(renderer: THREE.WebGLRenderer, tex: THREE.Texture, pose: DevicePose, focus: V3, p0: V3, n: V3, k: number, maxR = 14) {
    if (k <= 0.01) return tex;
    const u = this.pass.u;
    const { fw, rt, up } = basis(pose);
    u.tex!.value = tex;
    (u.camPos!.value as THREE.Vector3).set(...pose.cam);
    (u.fw!.value as THREE.Vector3).set(...fw);
    (u.rt!.value as THREE.Vector3).set(...rt);
    (u.up!.value as THREE.Vector3).set(...up);
    (u.P0!.value as THREE.Vector3).set(...p0);
    (u.N!.value as THREE.Vector3).set(...n);
    u.tf!.value = Math.tan(pose.fov / 2);
    const d: V3 = [focus[0] - pose.cam[0], focus[1] - pose.cam[1], focus[2] - pose.cam[2]];
    u.zf!.value = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
    u.k!.value = k;
    u.maxR!.value = maxR;
    this.pass.render(renderer, this.rt);
    return this.rt.texture;
  }
}
